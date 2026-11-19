'use client';

import { useEffect } from 'react';
import { useDriveStore } from '@/context/data-context';

/** How long the page can be away before what it shows is read again on return. */
export const STALE_AFTER_MS = 2 * 60_000;

/** How often to look for a gap that means the computer was asleep. */
const WAKE_CHECK_MS = 30_000;

/** Several signals of the same return produce one read. */
const REFRESH_COOLDOWN_MS = 5_000;

/**
 * Reads the folder on screen again when it may have gone stale: the network
 * came back, the tab was hidden for a while, or the computer slept.
 *
 * Nothing did this before, so a laptop closed on the dashboard and opened an
 * hour later showed the listing from an hour ago, with nothing to say so.
 *
 * Sleep is caught two ways because browsers differ: some report the page as
 * hidden while the machine sleeps, and some do not, but every one stops its
 * timers - so a 30-second timer that fires minutes late means the machine was
 * away.
 *
 * Silent: the rows on screen stay while the new ones load, and a read that
 * fails (still offline) leaves them as they were rather than replacing them
 * with an error.
 */
export function useRefreshOnReturn(): void {
  useEffect(() => {
    let lastRefresh = 0;

    const refresh = () => {
      if (navigator.onLine === false) return;
      // A return can trip more than one of the checks below at once - a
      // throttled timer and the visibility change, say. One read is enough.
      if (Date.now() - lastRefresh < REFRESH_COOLDOWN_MS) return;
      lastRefresh = Date.now();
      void useDriveStore.getState().refreshCurrentData({ silent: true });
    };

    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    let lastTick = Date.now();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      lastTick = Date.now();
      if (hiddenAt !== null && Date.now() - hiddenAt >= STALE_AFTER_MS) refresh();
      hiddenAt = null;
    };

    const timer = setInterval(() => {
      const now = Date.now();
      // Only while visible: a hidden tab's timers are slowed down on purpose,
      // and its return is the visibility handler's to catch.
      if (now - lastTick >= STALE_AFTER_MS && document.visibilityState === 'visible') refresh();
      lastTick = now;
    }, WAKE_CHECK_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', refresh);
    };
  }, []);
}
