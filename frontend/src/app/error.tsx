'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/components/ui';

/**
 * Catches render errors from any page or nested layout below the root layout.
 * Without this, App Router unmounts the tree and leaves a blank page that only
 * a manual reload recovers from.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled render error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <AlertTriangle className="h-8 w-8 text-primary" />
        </div>

        <h1 className="mb-3 text-2xl font-bold">Something went wrong</h1>

        <p className="mb-8 text-muted-foreground">
          This page ran into an unexpected problem. Trying again is usually enough. Your files are
          untouched.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset} size="lg" className="px-8">
            Try again
          </Button>
          {/* This boundary also covers the landing page and the blog, so home
              is the safe destination rather than the dashboard */}
          <Button asChild variant="outline" size="lg" className="px-8">
            <Link href="/">Go to homepage</Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-8 text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
