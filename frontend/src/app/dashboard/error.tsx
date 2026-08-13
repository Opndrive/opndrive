'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui';

/**
 * Dashboard scoped boundary. It renders inside the dashboard layout, so the
 * navbar and sidebar stay usable and only the content area is replaced. Errors
 * thrown by the dashboard layout itself fall through to app/error.tsx.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard render error:', error);
  }, [error]);

  return (
    <div className="flex h-full min-h-96 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <AlertTriangle className="h-7 w-7 text-primary" />
        </div>

        <h2 className="mb-2 text-xl font-semibold text-foreground">This view failed to load</h2>

        <p className="mb-6 text-sm text-muted-foreground">
          Something in this folder could not be displayed. Nothing was changed in your bucket.
        </p>

        {/* Retrying re-renders the same folder, so a broken one needs an exit
            too rather than a button that fails the same way every time */}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to My Drive</Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
