'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';

/**
 * Says that a drop is on its way, between it landing and its uploads starting.
 *
 * A large folder takes a while to read from disk, and then to check against
 * the bucket and plan, before its first card exists. Without this the page
 * showed nothing at all for that whole time, as if the drop had been missed.
 *
 * Subscribes to the queue store on its own, so the count ticking up does not
 * re-render the panel around it.
 */
export function PreparingRow() {
  const isReading = useUploadQueueStore((state) => state.readingDrops > 0);
  const filesFound = useUploadQueueStore((state) => state.filesFound);

  const message = isReading
    ? filesFound > 0
      ? `Reading dropped files… ${filesFound.toLocaleString()} found`
      : 'Reading dropped files…'
    : 'Getting ready to upload…';

  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 py-2 text-xs"
      style={{ color: 'var(--muted-foreground)' }}
    >
      <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
