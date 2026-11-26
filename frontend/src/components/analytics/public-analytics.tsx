'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

/**
 * The one place analytics enters this site. Mounted on the home page and in
 * the blog layout, and nowhere in the app.
 *
 * It does nothing unless the build had both NEXT_PUBLIC_POSTHOG_KEY and
 * NEXT_PUBLIC_POSTHOG_HOST. The condition below reads both directly, in one
 * expression, because that is what the bundler can evaluate: next.config.ts
 * defines each as "" when it is unset, the condition becomes `"" && ""` at
 * build time, and the import - the only route to the sending code - is dropped
 * with the branch it sits in. A default build, and so the Docker image, holds
 * no analytics code, key or host at all. CI checks the build output for that.
 *
 * Loaded after hydration and only in the browser: nothing about it belongs in
 * the server render.
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
