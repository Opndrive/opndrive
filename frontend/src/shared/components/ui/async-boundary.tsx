'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import type { ConnectionFailure } from '@/lib/s3/connection-failure';

/**
 * A value that is still arriving, or has failed to.
 *
 * Deliberately a union rather than a status flag sitting beside the data. The
 * bug this exists to stop was written twice, identically, in two different
 * pages:
 *
 *   const isReady = status[prefix] === 'ready';
 *   {isReady ? <Content /> : <Skeleton />}
 *
 * Three states collapsed into two, so a failed listing rendered as a skeleton
 * that would never resolve - and nothing about that shape made the omission
 * visible. With the data reachable only after narrowing, a view cannot render
 * rows without having said what a failure looks like. The compiler asks the
 * question that code review kept missing.
 */
export type AsyncState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; failure: ConnectionFailure; retry?: () => void }
  | { state: 'ready'; data: T };

interface AsyncBoundaryProps<T> {
  state: AsyncState<T>;
  /** Shown while loading, and before anything has been asked for. */
  pending: React.ReactNode;
  children: (data: T) => React.ReactNode;
}

/**
 * Renders one of the three outcomes, and hands over the data only for the one
 * that has any.
 */
export function AsyncBoundary<T>({ state, pending, children }: AsyncBoundaryProps<T>) {
  if (state.state === 'error') {
    return <ConnectionFailureNotice failure={state.failure} onRetry={state.retry} />;
  }

  if (state.state === 'ready') {
    return <>{children(state.data)}</>;
  }

  return <>{pending}</>;
}

/**
 * The failure itself.
 *
 * Says what happened, then offers the one action that can actually change the
 * outcome. Retry appears only where retrying could work: an unchanged wrong key
 * fails identically the second time, and a button that cannot succeed teaches
 * people to distrust the ones that can.
 */
export function ConnectionFailureNotice({
  failure,
  onRetry,
}: {
  failure: ConnectionFailure;
  onRetry?: () => void;
}) {
  // Wrong keys, a missing bucket and a wrong region are all fixed in the same
  // place, and it is not this page.
  const fixableOnConnect = failure.kind === 'credentials' || failure.kind === 'bucket';

  return (
    <div
      role="alert"
      className="mx-auto mt-12 flex max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-10 text-center"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
      </span>

      <h2 className="mt-4 text-base font-semibold text-foreground">{failure.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{failure.detail}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {failure.retryable && onRetry && (
          <Button onClick={onRetry} variant="default">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        )}

        {fixableOnConnect && (
          <Button asChild variant="outline">
            <Link href="/connect">Check your connection details</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
