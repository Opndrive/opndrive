'use client';

import { useLayoutEffect } from 'react';

/**
 * One shared lock for everything that needs the page to stop scrolling.
 *
 * Modals, sheets, the mobile sidebar and the mobile search overlay each used to
 * write `document.body.style.overflow` themselves, so whichever closed last won
 * regardless of what was still open. Closing a modal while the sidebar was
 * still open unlocked the page behind it; the reverse order could leave the
 * page unscrollable until a full reload.
 *
 * The counter here means the page stays locked while any holder is active and
 * unlocks exactly once the last one lets go.
 *
 * It deliberately does NOT capture a previous value to restore. Capturing is
 * what made the old bug permanent: a second component reading `overflow`
 * while the first already held it saw `'hidden'`, remembered that as the
 * "before" state, and put it back on close. Nothing in the app sets body
 * overflow for any other reason, so clearing the inline style is the only
 * resting state that can be correct.
 *
 * This is now the only thing in the app that writes body overflow. The three
 * overflow menus used to lock scroll by hand just to show a dropdown; they are
 * Radix menus now and do not lock at all, which is the behaviour a dropdown
 * should have had in the first place.
 */
let holders = 0;

function acquireScrollLock(): void {
  holders += 1;
  if (holders === 1) {
    document.body.style.overflow = 'hidden';
  }
}

function releaseScrollLock(): void {
  // Guarded so a stray extra release cannot drive the count negative and leave
  // a later lock unable to reach zero.
  holders = Math.max(0, holders - 1);
  if (holders === 0) {
    document.body.style.overflow = '';
  }
}

/** Holds the lock for as long as `active` is true and the caller is mounted. */
export const useScrollLock = (active: boolean) => {
  useLayoutEffect(() => {
    if (!active) return;

    acquireScrollLock();
    return releaseScrollLock;
  }, [active]);
};

/** Number of holders currently keeping the page locked. Exported for tests. */
export const getScrollLockHolders = (): number => holders;
