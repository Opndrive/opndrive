'use client';

import type { UploadStatus } from '@opndrive/s3-api';

/** One status or progress event from an upload manager, as the cards need it. */
export interface UploadCardEvent {
  id: string;
  status: UploadStatus;
  progress: number;
}

/**
 * How long events are collected before they reach the store.
 *
 * Short enough that a progress bar or a pause still looks immediate, long
 * enough that a drop of thousands of files updates its cards ten times a
 * second rather than thousands.
 */
export const UPLOAD_EVENT_WINDOW_MS = 100;

export interface UploadEventBatcher {
  /** Queues an event. A later event for the same upload replaces it. */
  push(event: UploadCardEvent): void;
  /** Hands over whatever is queued now, without waiting for the window. */
  flush(): void;
  /** Drops whatever is queued and stops the timer. */
  cancel(): void;
}

/**
 * Collects upload events and hands them on in one batch per window.
 *
 * Every store update copies the whole uploads map and re-renders the upload
 * panel, which reads every card. A manager sends several events per file -
 * queued, uploading, progress, completed - so applying each as it came made a
 * large drop cost the number of files times the number of cards, and 4,000
 * files spent about 20 seconds of main thread on a single round of progress.
 * Batched, a round costs one copy and one render however many files it covers.
 *
 * Only the latest event per upload is kept. Each event carries the upload's
 * whole status and progress, so an older one has nothing the newer one lacks.
 *
 * @param apply receives each batch, oldest upload first.
 * @param schedule defaults to setTimeout; injectable for tests.
 */
export function createUploadEventBatcher(
  apply: (batch: ReadonlyMap<string, { status: UploadStatus; progress: number }>) => void,
  {
    windowMs = UPLOAD_EVENT_WINDOW_MS,
    schedule = (run: () => void, ms: number) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  }: {
    windowMs?: number;
    schedule?: (run: () => void, ms: number) => () => void;
  } = {}
): UploadEventBatcher {
  let pending = new Map<string, { status: UploadStatus; progress: number }>();
  let unschedule: (() => void) | null = null;

  const flush = () => {
    unschedule?.();
    unschedule = null;
    if (pending.size === 0) return;

    // Swapped out before applying, so an event raised while the batch is
    // being applied starts the next batch instead of being lost with this one.
    const batch = pending;
    pending = new Map();
    apply(batch);
  };

  return {
    push({ id, status, progress }) {
      pending.set(id, { status, progress });
      unschedule ??= schedule(flush, windowMs);
    },
    flush,
    cancel() {
      unschedule?.();
      unschedule = null;
      pending = new Map();
    },
  };
}
