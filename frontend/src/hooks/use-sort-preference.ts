'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SortDirection } from '@/features/dashboard/utils/sort-items';

const SORT_STORAGE_KEY = 'opndrive-sort-preference';
const DEFAULT_DIRECTION: SortDirection = 'asc';

/**
 * Shared across every instance, the same way the layout preference is.
 *
 * The header renders the control and the page renders the rows, and they are
 * not in a parent-child relationship, so a hook holding only component state
 * would let the two disagree about which way the list is sorted.
 */
let globalDirection: SortDirection = DEFAULT_DIRECTION;
const listeners = new Set<(direction: SortDirection) => void>();

function isDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc';
}

/** The direction the file list is sorted in, remembered between visits. */
export function useSortPreference() {
  const [direction, setDirectionState] = useState<SortDirection>(globalDirection);

  useEffect(() => {
    const update = (next: SortDirection) => setDirectionState(next);
    listeners.add(update);

    return () => {
      listeners.delete(update);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);

      if (isDirection(saved)) {
        globalDirection = saved;
        setDirectionState(saved);
        listeners.forEach((listener) => listener(saved));
      }
    } catch (error) {
      // A browser refusing storage is not a reason to break sorting; it just
      // means the choice lasts as long as the tab does.
      console.warn('Failed to read the sort preference:', error);
    }
  }, []);

  const setDirection = useCallback((next: SortDirection) => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch (error) {
      console.warn('Failed to save the sort preference:', error);
    }

    // Outside the try on purpose: the list must reorder even where the write
    // failed, or the control looks broken in a private window.
    globalDirection = next;
    setDirectionState(next);
    listeners.forEach((listener) => listener(next));
  }, []);

  return { direction, setDirection };
}
