'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Configuration options for chunked display
 */
export interface ChunkedDisplayOptions {
  /** Number of items per chunk (default: 100) */
  chunkSize?: number;
  /** Distance from bottom to trigger auto-load in pixels (default: 200) */
  prefetchDistance?: number;
}

/**
 * Return type for useChunkedItems hook
 */
export interface ChunkedItemsResult<T> {
  /** Items to display (chunked subset of all items) */
  displayedItems: T[];
  /** Whether more chunks can be loaded from cache */
  canLoadMoreChunks: boolean;
  /** Ref for sentinel element (for IntersectionObserver) */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  /** Manually load more chunks */
  loadMoreChunks: () => void;
  /** Number of visible chunks */
  visibleChunks: number;
  /** Total number of items available */
  totalItems: number;
  /** Number of remaining items in cache */
  remainingItems: number;
}

/**
 * Progressive display of a long list that is already in memory: the search
 * results page shows them a chunk at a time, and reveals the next chunk as the
 * reader scrolls near the end or presses the button.
 *
 * A chunk appears at once. It used to wait 300 ms behind a timer, for items
 * that were already here: a pause on every chunk that only looked like
 * loading. The timer was also started from inside a state updater, which
 * React may call twice, so one scroll could reveal two chunks.
 *
 * The observer is rebuilt after every chunk. It reports an element's
 * intersection when it starts observing, so a sentinel still on screen after a
 * chunk (a tall window, a short chunk) reveals the next one instead of waiting
 * for a scroll that is not coming.
 *
 * @param items - All items to display
 * @param options - Configuration options
 * @param resetDependency - A key that identifies the list (for search, the query and its
 *   scope); a new value starts over at the first chunk
 *
 * @example
 * ```tsx
 * const { displayedItems, sentinelRef, canLoadMoreChunks } = useChunkedItems(
 *   allResults,
 *   { chunkSize: 100 },
 *   `${query}::${scope}`
 * );
 * ```
 */
export function useChunkedItems<T>(
  items: T[],
  options: ChunkedDisplayOptions = {},
  resetDependency?: string | null
): ChunkedItemsResult<T> {
  const { chunkSize = 100, prefetchDistance = 200 } = options;

  const [visibleChunks, setVisibleChunks] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // The most chunks this list can fill. Each reveal stops there, so two
  // triggers at once (the sentinel and the button) cannot run ahead and make
  // the next results that stream in appear two chunks at a time.
  const chunksNeeded = Math.max(1, Math.ceil(items.length / chunkSize));
  const maxVisibleItems = visibleChunks * chunkSize;
  const displayedItems = items.slice(0, maxVisibleItems);
  const canLoadMoreChunks = items.length > maxVisibleItems;
  const remainingItems = items.length - maxVisibleItems;

  /** Start over at the first chunk when the list is a different one. */
  useEffect(() => {
    setVisibleChunks(1);
  }, [resetDependency]);

  const loadMoreChunks = useCallback(() => {
    if (canLoadMoreChunks) setVisibleChunks((prev) => Math.min(prev + 1, chunksNeeded));
  }, [canLoadMoreChunks, chunksNeeded]);

  /** Reveal the next chunk when the sentinel nears the viewport. */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMoreChunks) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleChunks((prev) => Math.min(prev + 1, chunksNeeded));
        }
      },
      {
        // Trigger when the sentinel is this far from being visible.
        rootMargin: `${prefetchDistance}px 0px`,
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
    // visibleChunks: a fresh observer after each chunk; see above.
  }, [canLoadMoreChunks, chunksNeeded, prefetchDistance, visibleChunks]);

  return {
    displayedItems,
    canLoadMoreChunks,
    sentinelRef,
    loadMoreChunks,
    visibleChunks,
    totalItems: items.length,
    remainingItems: Math.max(0, remainingItems),
  };
}

/**
 * Helper function to format item count display
 * Shows "100+ items" when there are more, or "42 items" when showing all
 *
 * @param displayedCount - Number of items currently displayed
 * @param hasMore - Whether there are more items available
 * @returns Formatted string for display
 */
export function formatItemCount(displayedCount: number, hasMore: boolean): string {
  const formattedCount = displayedCount.toLocaleString();

  if (hasMore) {
    return `Showing ${formattedCount}+ items`;
  }

  return `${formattedCount} item${displayedCount === 1 ? '' : 's'}`;
}
