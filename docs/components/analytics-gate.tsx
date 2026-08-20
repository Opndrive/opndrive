'use client';

import { Analytics } from '@vercel/analytics/next';
import { useAnalyticsConsent } from '@/lib/consent';

/**
 * Mirrors the main app's AnalyticsGate.
 *
 * Not rendering is the mechanism: `<Analytics />` injects its script on mount,
 * so returning null is what actually stops the request. Waiting for
 * `isResolved` means an opt-out set on the main site is honoured here before
 * the first page view rather than after it.
 */
export function AnalyticsGate() {
  const { analytics, isResolved } = useAnalyticsConsent();

  if (!isResolved || !analytics) return null;

  return <Analytics />;
}
