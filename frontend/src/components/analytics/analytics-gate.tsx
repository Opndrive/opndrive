'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { redactAnalyticsEvent } from '@/lib/privacy/redact-url';

/**
 * The single place analytics is mounted.
 *
 * It exists for two reasons. `beforeSend` is a function, and the root layout
 * is a server component, so the handler cannot be passed across that boundary
 * - it has to be owned by a client component. And routing every analytics
 * mount through one component means a future script cannot be dropped into a
 * layout without passing whatever this file decides.
 *
 * Today that decision is only URL redaction. Consent gating lands here next:
 * the `enableAnalytics` setting is deliberately still unwired, and when it is
 * wired it returns null from here rather than filtering downstream, because
 * these components inject their script on mount - not rendering them is the
 * only thing that actually prevents the request.
 */
export function AnalyticsGate() {
  return (
    <>
      <Analytics beforeSend={redactAnalyticsEvent} />
      <SpeedInsights beforeSend={redactAnalyticsEvent} />
    </>
  );
}
