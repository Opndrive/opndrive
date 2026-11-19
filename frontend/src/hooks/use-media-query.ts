'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept current as the window changes.
 *
 * `fallback` is the answer wherever there is no `matchMedia` to ask: on the
 * server, and in jsdom.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );

  const read = () =>
    typeof window === 'undefined' || !window.matchMedia
      ? fallback
      : window.matchMedia(query).matches;

  return useSyncExternalStore(subscribe, read, () => fallback);
}

/** Tailwind's `sm` breakpoint, where the list switches from cards to a table. */
export const DESKTOP_LIST_QUERY = '(min-width: 640px)';
