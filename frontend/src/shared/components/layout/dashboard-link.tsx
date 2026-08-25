'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

/**
 * The way back into the drive, for a visitor who already has one connected.
 *
 * These pages used to redirect such a visitor to the dashboard on sight. They
 * no longer do - a page worth ranking is a page worth letting someone read -
 * so the route through has to be visible instead of automatic.
 *
 * Renders nothing until a session has actually been found. `userCreds` is null
 * on the server and on the first client render alike, because the provider
 * only reads localStorage in an effect, so there is no hydration mismatch to
 * guard against here; waiting for `isLoading` to clear just avoids showing a
 * link, hiding it, and showing it again while the restore is in flight.
 */
export function DashboardLink({ className }: { className?: string }) {
  const { userCreds, isLoading } = useAuth();

  if (isLoading || !userCreds) return null;

  return (
    <Link
      href="/dashboard"
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90'
      }
    >
      Go to Dashboard
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
