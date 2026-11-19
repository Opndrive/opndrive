'use client';

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

/**
 * Says so while the browser has no network.
 *
 * Without it, losing the connection looked like nothing at all: the folder on
 * screen stayed as it was, actions failed one by one, and an upload sat still.
 * Shown only when the browser is sure it is offline, and gone the moment it is
 * back, when the folder is read again (see useRefreshOnReturn).
 */
export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      className="mb-3 flex items-start gap-3 rounded-lg border p-3 sm:p-4"
      style={{ background: 'var(--warning-surface)', borderColor: 'var(--warning-border)' }}
    >
      <WifiOff
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0"
        style={{ color: 'var(--warning)' }}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">You&rsquo;re offline</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What&rsquo;s on screen may be out of date. Uploads that were interrupted carry on, and
          this folder is read again, when the connection is back.
        </p>
      </div>
    </div>
  );
}
