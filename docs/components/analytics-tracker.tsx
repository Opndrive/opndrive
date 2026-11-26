'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  browserEnvironment,
  createSender,
  listenForLinkClicks,
  type AnalyticsSender,
} from '@/lib/analytics-core';
import { readAnalyticsPreference } from '@/lib/consent';
import { APP_URL, DOCS_URL } from '@/lib/links';

/** One sender, and so one visit, for the life of the document. */
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
      // Every docs page is public; none handles credentials or files.
      isTrackedPath: () => true,
      appOrigins: originOf(APP_URL),
      docsOrigins: [window.location.origin, ...originOf(DOCS_URL)],
      hasOptedOut: () => !readAnalyticsPreference(),
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

  useEffect(() => listenForLinkClicks(document, getSender()), []);

  return null;
}
