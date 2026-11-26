'use client';

import { useLayoutEffect } from 'react';
import { PAGE_PROFILE_GLOBAL } from '@/lib/privacy/page-profile';

/**
 * Reloads an app page that was reached without loading a new document.
 *
 * Public pages are served with a policy that lets them connect only to this
 * site (see page-profile.ts). A document keeps that policy after Next.js moves
 * it to /connect or /dashboard, where it would block every request to the
 * user's storage. Links into the app are full page loads for that reason; this
 * catches the one that is not, by loading the page again under its own policy.
 *
 * A layout effect, so it runs before the effects of the page below it, which
 * are where storage requests start.
 */
export function PublicPolicyReload() {
  useLayoutEffect(() => {
    const profile = (window as unknown as Record<string, unknown>)[PAGE_PROFILE_GLOBAL];
    if (profile === 'public') window.location.reload();
  }, []);

  return null;
}
