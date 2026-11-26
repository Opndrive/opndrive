'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  browserEnvironment,
  createSender,
  listenForLinkClicks,
  type AnalyticsSender,
} from '@/lib/analytics/analytics-core';
import { isTrackedPath } from '@/lib/analytics/tracked-paths';
import { LINK_REPORT_EVENT } from '@/lib/analytics/report-link';
import { mayLoadAnalytics } from '@/lib/privacy/consent';
import { DOCS_URL, SITE_URL } from '@/config/links';

/**
 * One sender for the life of the document, shared by the home page and the
 * blog, so moving between them inside one tab stays one visit.
 */
let sender: AnalyticsSender | null = null;

function originOf(url: string): string[] {
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

function getSender(): AnalyticsSender {
  sender ??= createSender(
    {
      key: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
      isTrackedPath,
      appOrigins: [window.location.origin, ...originOf(SITE_URL)],
      docsOrigins: originOf(DOCS_URL),
      hasOptedOut: () => !mayLoadAnalytics(),
    },
    browserEnvironment()
  );
  return sender;
}

/** Only ever loaded through PublicAnalytics. */
export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    getSender().pageview();
  }, [pathname]);

  useEffect(() => {
    const current = getSender();
    const stopListening = listenForLinkClicks(document, current);

    const onReport = (event: Event) => {
      const href = (event as CustomEvent<unknown>).detail;
      if (typeof href === 'string') current.linkClick(href);
    };
    window.addEventListener(LINK_REPORT_EVENT, onReport);

    return () => {
      stopListening();
      window.removeEventListener(LINK_REPORT_EVENT, onReport);
    };
  }, []);

  return null;
}
