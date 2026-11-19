'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { PageState } from '@/context/folder-listing';
import { useDriveStore } from '@/context/data-context';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';

/**
 * What the virtualized list and grid have in common: one folder drawn a screen
 * at a time inside the dashboard's `<main>`, reading pages as the user nears
 * the end, remembering where they were, and saying what has loaded.
 */

/** How close to the loaded end, in screens, before the next page is read. */
export const PREFETCH_SCREENS = 2;
/** The fewest milliseconds between two "items loaded" announcements. */
const ANNOUNCE_EVERY_MS = 2000;

/** The dashboard's scroll container, found from inside it. */
export function scrollParentOf(ref: RefObject<HTMLElement | null>): HTMLElement | null {
  return ref.current?.closest<HTMLElement>('main') ?? null;
}

/**
 * Jumps rather than glides.
 *
 * `<main>` has `scroll-behavior: smooth`, which every `scrollTo` without a
 * behavior inherits. The virtualizer writes the scroll position to keep rows in
 * place, and a write that animates is the very jump it exists to prevent.
 */
export function scrollInstantly(
  offset: number,
  { adjustments = 0, behavior }: { adjustments?: number; behavior?: ScrollBehavior },
  instance: Virtualizer<HTMLElement, Element>
) {
  instance.scrollElement?.scrollTo?.({
    top: offset + adjustments,
    behavior: behavior === 'smooth' ? 'smooth' : 'instant',
  });
}

/**
 * Measures where the rows start within `<main>`'s scrolling content: below the
 * banners, breadcrumb and header. The value lives in the caller's state, which
 * the virtualizer reads, so a change re-renders it with the new margin.
 *
 * Not measured on every scroll. Reading layout straight after the rows for a
 * new screen are committed forces the browser to lay them out there and then,
 * and that was the largest single cost of a jump across the list. It is
 * measured when the list's own size changes, and otherwise once scrolling
 * stops. Between the two, a stale margin only shifts which rows count as near
 * the screen, which the overscan absorbs; rows are positioned within the list,
 * so none are drawn in the wrong place.
 */
export function useMeasureScrollMargin(
  bodyRef: RefObject<HTMLElement | null>,
  [margin, setMargin]: [number, (margin: number) => void],
  isScrolling: boolean,
  totalSize: number,
  layoutKey: unknown
) {
  useLayoutEffect(() => {
    if (isScrolling) return;

    const body = bodyRef.current;
    const main = scrollParentOf(bodyRef);
    if (!body || !main) return;

    const mainRect = main.getBoundingClientRect();
    // Nothing laid out yet, or no layout at all (jsdom).
    if (mainRect.height === 0) return;

    const next = Math.round(body.getBoundingClientRect().top - mainRect.top + main.scrollTop);
    if (next !== margin) setMargin(next);
  }, [bodyRef, margin, setMargin, isScrolling, totalSize, layoutKey]);
}

/**
 * Reads the next page once the user is within two screens of the loaded end.
 *
 * Runs again whenever the visible range moves or a page lands, so a page that
 * leaves the user still near the end asks for the one after it. Never after a
 * failure: that waits for the retry row.
 */
export function usePrefetchNextPage(
  virtualizer: Virtualizer<HTMLElement, Element>,
  {
    complete,
    nextPage,
    onLoadMore,
    scrollMargin,
  }: {
    complete: boolean;
    nextPage: PageState;
    onLoadMore?: () => void;
    scrollMargin: number;
  }
) {
  const totalSize = virtualizer.getTotalSize();
  const rangeEnd = virtualizer.range?.endIndex ?? -1;

  useEffect(() => {
    if (complete || nextPage.status !== 'idle' || !onLoadMore) return;

    const viewport = virtualizer.scrollRect?.height ?? window.innerHeight;
    const offset = (virtualizer.scrollOffset ?? 0) - scrollMargin;
    const remaining = totalSize - (offset + viewport);

    if (remaining <= viewport * PREFETCH_SCREENS) onLoadMore();
  }, [complete, nextPage.status, onLoadMore, rangeEnd, totalSize, scrollMargin, virtualizer]);
}

/**
 * Keeps where the user was in this folder for when they come back.
 *
 * The virtualizer's own record of the last scroll event, not `<main>` read at
 * unmount: by then the next folder's rows are in the DOM and the browser may
 * already have clamped `scrollTop` to fit them. Nor a listener of our own,
 * which would run after the virtualizer has re-rendered the rows and force the
 * browser to lay them all out on the spot to answer it.
 */
export function useRememberScroll(
  listingKey: string | undefined,
  virtualizer: Virtualizer<HTMLElement, Element>,
  initialOffset: number
) {
  const rememberScrollOffset = useDriveStore((state) => state.rememberScrollOffset);

  useEffect(() => {
    if (!listingKey) return;
    return () => rememberScrollOffset(listingKey, virtualizer.scrollOffset ?? initialOffset);
  }, [listingKey, rememberScrollOffset, virtualizer, initialOffset]);
}

/** Says how much has loaded, at most every couple of seconds. Silent on mount. */
export function useLoadedAnnouncement(count: number, complete: boolean): string {
  const [text, setText] = useState('');
  const first = useRef(true);
  const last = useRef(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    const message = complete
      ? `All ${count.toLocaleString()} items loaded`
      : `${count.toLocaleString()} items loaded`;
    const wait = ANNOUNCE_EVERY_MS - (Date.now() - last.current);
    const say = () => {
      last.current = Date.now();
      setText(message);
    };

    if (wait <= 0) {
      say();
      return;
    }

    const timer = setTimeout(say, wait);
    return () => clearTimeout(timer);
  }, [count, complete]);

  return text;
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Escape clears the selection; Ctrl/Cmd+A selects everything loaded.
 *
 * Neither while typing, and Ctrl+A not from inside a dialog or a menu, where
 * the browser's own meaning of the keys belongs to whatever is open.
 */
export function useSelectionKeys(allItems: (Folder | FileItem)[]) {
  const clearSelection = useMultiSelectStore((state) => state.clearSelection);
  const selectAll = useMultiSelectStore((state) => state.selectAll);
  const items = useRef(allItems);
  items.current = allItems;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }
      if (e.key.toLowerCase() !== 'a' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) {
        return;
      }
      if (isEditable(e.target)) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="menu"]')) return;

      e.preventDefault();
      selectAll(items.current);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, selectAll]);
}

/** Under the folders while later pages may still add to them. */
export function FoldersNote() {
  return (
    <div className="flex h-full items-center px-4 text-xs text-muted-foreground">
      More folders may still appear as the rest of this folder loads.
    </div>
  );
}

/** The pages not read yet: loading, or a retry after a failure. */
export function MoreRow({
  nextPage,
  onLoadMore,
}: {
  nextPage: PageState;
  onLoadMore?: () => void;
}) {
  return nextPage.status === 'error' ? (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <span>Couldn&apos;t load more</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => onLoadMore?.()}
        className="cursor-pointer rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/10"
      >
        Retry
      </button>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span>Loading more…</span>
    </div>
  );
}
