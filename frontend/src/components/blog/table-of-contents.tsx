'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PostHeading } from '@/lib/blog-content/headings';
import { cn } from '@/shared/utils/utils';

/**
 * How close to the top of the window a heading has to come before its
 * section counts as the one being read. Near the top, so the heading a reader
 * jumps to from this list is the one it marks - not a subsection a paragraph
 * below it - and one that has only just appeared lower down does not take
 * over.
 */
const READING_LINE_PX = 120;

/**
 * The id of the section being read: the last heading above the reading line.
 *
 * An IntersectionObserver says when any heading crosses the line, and only
 * then are the headings measured - nothing runs on plain scrolling.
 */
function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    // Without the observer the list still works; it just marks nothing.
    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const update = () => {
      const line = READING_LINE_PX;
      let current: string | null = null;
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= line) current = element.id;
        else break;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(update, {
      // A band from the top of the page to the reading line: a heading enters
      // or leaves it exactly when it crosses the line.
      rootMargin: `0px 0px -${Math.max(0, window.innerHeight - READING_LINE_PX)}px 0px`,
    });
    elements.forEach((element) => observer.observe(element));
    update();

    return () => observer.disconnect();
  }, [ids]);

  return active;
}

interface TableOfContentsProps {
  headings: PostHeading[];
  /**
   * `sidebar`: the sticky list beside the post on wide screens, with the
   * current section marked and its subsections opened under it.
   * `collapsible`: a closed "On this page" panel above the post on narrow
   * screens, top-level sections only.
   */
  variant: 'sidebar' | 'collapsible';
  className?: string;
}

export function TableOfContents({ headings, variant, className }: TableOfContentsProps) {
  const ids = useMemo(() => headings.map((heading) => heading.id), [headings]);
  const active = useActiveHeading(variant === 'sidebar' ? ids : []);
  const listRef = useRef<HTMLOListElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // The section each heading belongs to: itself for an h2, the h2 before it
  // for an h3.
  const sectionOf = useMemo(() => {
    const map = new Map<string, string>();
    let section: string | null = null;
    for (const heading of headings) {
      if (heading.level === 2) section = heading.id;
      if (section) map.set(heading.id, section);
    }
    return map;
  }, [headings]);
  const activeSection = active ? (sectionOf.get(active) ?? null) : null;

  // Keep the marked entry in view inside a long list, without scrolling the
  // page: only the list's own scroll position moves.
  useEffect(() => {
    const list = listRef.current;
    const item = Array.from(list?.children ?? []).find(
      (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.id === active
    );
    if (!list || !item) return;
    // The list is the items' offset parent, so offsetTop is within the list.
    const top = item.offsetTop;
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 3;
    }
  }, [active]);

  const sections = headings.filter((heading) => heading.level === 2);

  if (variant === 'collapsible') {
    return (
      <details
        ref={detailsRef}
        className={cn('group rounded-2xl border border-border bg-card', className)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <nav aria-label="On this page" className="border-t border-border px-2 py-2">
          <ol className="space-y-0.5">
            {sections.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  // Close the panel once a section is picked, so the reader
                  // lands on the section rather than on the open list.
                  onClick={() => detailsRef.current?.removeAttribute('open')}
                  className="block rounded-lg px-3 py-2 text-sm leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>
    );
  }

  return (
    <nav aria-labelledby="toc-heading" className={cn('flex min-h-0 flex-col', className)}>
      {/* A label for the landmark, not a heading: the post's own sections are
          the headings a screen reader should list. */}
      <p id="toc-heading" className="mb-3 text-sm font-semibold text-foreground">
        On this page
      </p>
      <ol
        ref={listRef}
        className="custom-scrollbar relative min-h-0 space-y-px overflow-y-auto border-l border-border pr-1"
      >
        {headings.map((heading) => {
          const isActive = heading.id === active;
          // Subsections show under the section being read, which keeps a long
          // post's list short enough to scan.
          if (heading.level === 3 && sectionOf.get(heading.id) !== activeSection) return null;
          return (
            <li key={heading.id} data-id={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  '-ml-px block border-l-2 py-1.5 pr-2 text-sm leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                  heading.level === 2 ? 'pl-3' : 'pl-6 text-[13px]',
                  isActive
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
