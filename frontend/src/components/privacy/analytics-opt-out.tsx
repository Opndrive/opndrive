'use client';

import { BarChart3 } from 'lucide-react';
import { Switch } from '@/shared/components/ui/switch';
import { setAnalyticsOptOut, useConsent } from '@/lib/privacy/consent';

/**
 * The objection route, under GDPR Article 21.
 *
 * Analytics runs on legitimate interests, so we are not asking permission -
 * but an objection has to be genuinely available, and it has to be as easy as
 * doing nothing. Hence a switch on the privacy page and in Settings rather
 * than a banner nobody asked for.
 *
 * Rendered disabled until the preference has been read, so it never briefly
 * shows the wrong position and invites a click that flips it back.
 */
export function AnalyticsOptOut() {
  const { analytics, isResolved } = useConsent();

  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-card p-4">
      <BarChart3 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <label
          htmlFor="analytics-opt-out"
          className="block text-sm font-medium text-foreground cursor-pointer"
        >
          Anonymous usage analytics
        </label>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {analytics
            ? 'On. We count page views without cookies and without profiling you. Turn this off and we stop counting yours.'
            : 'Off. We are not counting your visits. This is remembered on this site and on the documentation site.'}
        </p>
      </div>

      <Switch
        id="analytics-opt-out"
        checked={analytics}
        disabled={!isResolved}
        onCheckedChange={(checked) => setAnalyticsOptOut(!checked)}
        aria-label="Anonymous usage analytics"
      />
    </div>
  );
}
