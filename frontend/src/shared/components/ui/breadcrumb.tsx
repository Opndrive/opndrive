'use client';

/**
 * A breadcrumb trail that stays one line wide no matter how deep the path is.
 *
 * Two things keep it from growing: long names are cut to a character budget and
 * carry the full name in a tooltip, and a trail with too many crumbs collapses
 * its middle into a menu the way Drive does. Neither of those is a scroll
 * container, which matters - the overflow menu is absolutely positioned, and an
 * ancestor with `overflow-x: auto` would clip it.
 */

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight, Folder, MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/utils/utils';

const ELLIPSIS = '…';

interface BreadcrumbItemBase {
  /** The full name. This is what the tooltip and the overflow menu show. */
  name: string;
  /** Drawn before the label. Decorative - the name is what carries the meaning. */
  icon?: ReactNode;
}

/**
 * A crumb navigates through an href, a callback, or both - but never neither,
 * which is what the union enforces at the call site.
 */
export type BreadcrumbItem =
  | (BreadcrumbItemBase & { href: string; onSelect?: () => void })
  | (BreadcrumbItemBase & { href?: undefined; onSelect: () => void });

export interface BreadcrumbProps {
  /** Root first, current location last. */
  items: BreadcrumbItem[];
  /** Names longer than this are cut to this many characters, ellipsis included. */
  maxLabelLength?: number;
  /** The trail collapses once it holds more crumbs than this. */
  maxVisibleItems?: number;
  /** Crumbs kept at the head of a collapsed trail. */
  itemsBeforeCollapse?: number;
  /** Crumbs kept at the tail of a collapsed trail. */
  itemsAfterCollapse?: number;
  separator?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

/**
 * Cuts `name` so the returned string is at most `maxLength` characters with the
 * ellipsis counted, because a budget the ellipsis can overrun is not a budget.
 */
export function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, Math.max(1, maxLength - 1)).trimEnd() + ELLIPSIS;
}

interface TrailSplit {
  head: BreadcrumbItem[];
  hidden: BreadcrumbItem[];
  tail: BreadcrumbItem[];
}

function splitTrail(
  items: BreadcrumbItem[],
  before: number,
  after: number,
  maxVisible: number
): TrailSplit {
  const kept = before + after;

  // Hiding a single crumb behind a menu button trades one chip for another, so
  // it only collapses when at least two crumbs go away.
  if (items.length <= maxVisible || items.length - kept < 2) {
    return { head: items, hidden: [], tail: [] };
  }

  return {
    head: items.slice(0, before),
    hidden: items.slice(before, items.length - after),
    tail: items.slice(items.length - after),
  };
}

type TrailEntry =
  | { kind: 'crumb'; item: BreadcrumbItem; index: number }
  | { kind: 'collapsed'; items: BreadcrumbItem[] };

export function Breadcrumb({
  items,
  maxLabelLength = 20,
  maxVisibleItems = 5,
  itemsBeforeCollapse = 1,
  itemsAfterCollapse = 2,
  separator,
  ariaLabel = 'Breadcrumb',
  className,
}: BreadcrumbProps) {
  const { head, hidden, tail } = splitTrail(
    items,
    itemsBeforeCollapse,
    itemsAfterCollapse,
    maxVisibleItems
  );

  const lastIndex = items.length - 1;
  const tailOffset = items.length - tail.length;

  const entries: TrailEntry[] = [
    ...head.map((item, index): TrailEntry => ({ kind: 'crumb', item, index })),
    ...(hidden.length > 0 ? [{ kind: 'collapsed' as const, items: hidden }] : []),
    ...tail.map((item, index): TrailEntry => ({ kind: 'crumb', item, index: tailOffset + index })),
  ];

  return (
    <nav aria-label={ariaLabel} className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center text-sm">
        {entries.map((entry, position) => (
          <li
            key={entry.kind === 'collapsed' ? 'collapsed' : `${entry.index}-${entry.item.name}`}
            className="flex min-w-0 items-center"
          >
            {position > 0 &&
              (separator ?? (
                <ChevronRight
                  aria-hidden="true"
                  className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              ))}

            {entry.kind === 'collapsed' ? (
              <CollapsedCrumbs items={entry.items} />
            ) : (
              <Crumb
                item={entry.item}
                isCurrent={entry.index === lastIndex}
                maxLabelLength={maxLabelLength}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface CrumbProps {
  item: BreadcrumbItem;
  isCurrent: boolean;
  maxLabelLength: number;
}

function Crumb({ item, isCurrent, maxLabelLength }: CrumbProps) {
  const label = truncateName(item.name, maxLabelLength);

  // Only a cut name earns a tooltip; a tooltip repeating what is already on
  // screen is noise on every hover.
  const title = label === item.name ? undefined : item.name;

  // `truncate` is the backstop for narrow viewports and wide glyphs, where the
  // character budget alone still leaves the chip too big to fit.
  const classes = cn(
    'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    isCurrent
      ? // The current folder shrinks last, so it stays readable while its
        // ancestors give up width first.
        'max-w-40 shrink-[0.35] bg-secondary/30 font-medium text-foreground sm:max-w-64'
      : 'max-w-32 text-muted-foreground hover:bg-secondary/50 hover:text-foreground sm:max-w-48'
  );

  const content = (
    <>
      {item.icon && (
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {item.icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={item.onSelect}
        title={title}
        aria-current={isCurrent ? 'page' : undefined}
        className={classes}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={item.onSelect}
      title={title}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(classes, 'cursor-pointer text-left')}
    >
      {content}
    </button>
  );
}

function CollapsedCrumbs({ items }: { items: BreadcrumbItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Opening with the keyboard has to land somewhere, and the first hidden
  // folder is the only sensible place.
  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [isOpen]);

  const handleMenuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (options.length === 0) return;

    const current = options.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    options[(current + step + options.length) % options.length].focus();
  };

  const select = (item: BreadcrumbItem) => {
    setIsOpen(false);
    item.onSelect?.();
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Show ${items.length} hidden folders`}
        className={cn(
          'flex cursor-pointer items-center rounded-md px-1.5 py-1 text-muted-foreground transition-colors',
          'hover:bg-secondary/50 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isOpen && 'bg-secondary/50 text-foreground'
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeys}
          className={cn(
            'absolute left-0 top-full z-50 mt-1.5 w-max min-w-48 max-w-72',
            'max-h-72 overflow-y-auto overflow-x-hidden scrollbar-thin',
            'rounded-lg border border-border bg-secondary p-1 shadow-xl'
          )}
        >
          {items.map((item, index) => (
            <MenuCrumb key={`${index}-${item.name}`} item={item} onSelect={() => select(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

interface MenuCrumbProps {
  item: BreadcrumbItem;
  onSelect: () => void;
}

function MenuCrumb({ item, onSelect }: MenuCrumbProps) {
  // The menu is where a hidden folder gets read in full, so nothing is cut to a
  // character budget here - only to the width of the menu.
  const classes = cn(
    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
    'text-foreground transition-colors hover:bg-card focus-visible:bg-card focus-visible:outline-none'
  );

  const content = (
    <>
      <span aria-hidden="true" className="flex shrink-0 items-center text-muted-foreground">
        {item.icon ?? <Folder className="h-4 w-4" />}
      </span>
      <span className="truncate">{item.name}</span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        role="menuitem"
        title={item.name}
        onClick={onSelect}
        className={classes}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" title={item.name} onClick={onSelect} className={classes}>
      {content}
    </button>
  );
}
