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
  /** Delay before loading next chunk in ms (default: 300) */
  loadDelay?: number;
}

/**
 * Return type for useChunkedItems hook
 */
export interface ChunkedItemsResult<T> {
  /** Items to display (chunked subset of all items) */
  displayedItems: T[];
  /** Whether more chunks can be loaded from cache */
  canLoadMoreChunks: boolean;
  /** Whether currently loading more chunks */
  isLoadingChunks: boolean;
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
 * Custom hook for progressive chunked display of large lists
 *
 * Features:
 * - Automatic loading via IntersectionObserver
 * - Manual load more button support
 * - Configurable chunk size and prefetch distance
 * - Performance optimized for large datasets
 * - Reusable across browse and search pages
 *
 * @param items - All items to display (from cache/API)
 * @param options - Configuration options
 * @param resetDependency - Dependency that triggers chunk reset (e.g., query, prefix)
 *
 * @example
 * ```tsx
 * const { displayedItems, sentinelRef, canLoadMoreChunks } = useChunkedItems(
 *   allResults,
 *   { chunkSize: 100 },
 *   query // Reset chunks when query changes
 * );
 * ```
 */
export function useChunkedItems<T>(
  items: T[],
  options: ChunkedDisplayOptions = {},
  resetDependency?: string | null
): ChunkedItemsResult<T> {
  const { chunkSize = 100, prefetchDistance = 200, loadDelay = 300 } = options;

  const [visibleChunks, setVisibleChunks] = useState(1);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Calculate displayed items
  const maxVisibleItems = visibleChunks * chunkSize;
  const displayedItems = items.slice(0, maxVisibleItems);
  const canLoadMoreChunks = items.length > maxVisibleItems;
  const remainingItems = items.length - maxVisibleItems;

  /**
   * Reset chunks when dependency changes (e.g., new search query, different folder)
   */
  useEffect(() => {
    setVisibleChunks(1);
    setIsLoadingChunks(false);
  }, [resetDependency]);

  /**
   * Manual function to load more chunks
   */
  const loadMoreChunks = useCallback(() => {
    if (isLoadingChunks || !canLoadMoreChunks) return;

    setIsLoadingChunks(true);

    setTimeout(() => {
      setVisibleChunks((prev) => prev + 1);
      setIsLoadingChunks(false);
    }, loadDelay);
  }, [isLoadingChunks, canLoadMoreChunks, loadDelay]);

  /**
   * IntersectionObserver for automatic chunk loading
   * Triggers when user scrolls near the bottom
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMoreChunks) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        // Only trigger if intersecting and not currently loading
        if (entry.isIntersecting) {
          // Use a ref check inside the callback to avoid stale closure
          setIsLoadingChunks((currentLoading) => {
            if (currentLoading) return true; // Already loading, don't trigger

            // Start loading
            setTimeout(() => {
              setVisibleChunks((prev) => prev + 1);
              setIsLoadingChunks(false);
            }, loadDelay);

            return true; // Set loading to true
          });
        }
      },
      {
        // Trigger when the sentinel is X px away from being visible
        rootMargin: `${prefetchDistance}px 0px`,
        threshold: 0.01, // Changed from 0 to 0.01 for better detection
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [canLoadMoreChunks, prefetchDistance, loadDelay]); // Removed isLoadingChunks dependency!

  return {
    displayedItems,
    canLoadMoreChunks,
    isLoadingChunks,
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
