'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

/**
 * Mirrors the main site's PublicAnalytics: nothing at all unless the build had
 * both NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST. next.config.mjs
 * defines both as "" when unset, so this condition folds to false at build
 * time and the sending code is left out of the build.
 */
const AnalyticsTracker =
  process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST
    ? dynamic(() => import('./analytics-tracker'), { ssr: false })
    : null;

export function PublicAnalytics() {
  if (!AnalyticsTracker) return null;

  return (
    <Suspense fallback={null}>
      <AnalyticsTracker />
    </Suspense>
  );
}
