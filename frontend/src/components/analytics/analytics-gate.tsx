'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { redactAnalyticsEvent } from '@/lib/privacy/redact-url';
import { useConsent } from '@/lib/privacy/consent';

/**
 * The single place analytics is mounted.
 *
 * It exists for two reasons. `beforeSend` is a function, and the root layout
 * is a server component, so the handler cannot be passed across that boundary
 * - it has to be owned by a client component. And routing every analytics
 * mount through one component means a future script cannot be dropped into a
 * layout without passing whatever this file decides.
 *
 * Not rendering is the mechanism, deliberately. Both components inject their
 * script when they mount, so returning null is what actually prevents the
 * request. Filtering inside `beforeSend` would be too late: the script would
 * already have loaded. `beforeSend` stays as the second layer, redacting the
 * URL of the events that are allowed through.
 */
export function AnalyticsGate() {
  const { analytics, isResolved } = useConsent();

  // Waits for the preference to be read. The cookie is not visible during
  // render, and mounting first would fire a page view before an opt-out could
  // be honoured - the one event we can never take back.
  if (!isResolved || !analytics) return null;

  return (
    <>
      <Analytics beforeSend={redactAnalyticsEvent} />
      <SpeedInsights beforeSend={redactAnalyticsEvent} />
    </>
  );
}
