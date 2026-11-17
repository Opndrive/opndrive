'use client';

import { useEffect } from 'react';
import type { UploadStatus } from '@opndrive/s3-api';
import { useUploadStore } from '../stores/use-upload-store';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';

/**
 * Upload states that closing the tab ends for good.
 *
 * Paused is one of them: nothing is moving, but the file handle lives in this
 * tab and the upload cannot be picked up again without it. An upload waiting
 * between automatic retries stays 'uploading', so it is covered too.
 */
const UNFINISHED_UPLOAD_STATUSES: ReadonlySet<UploadStatus> = new Set([
  'queued',
  'uploading',
  'paused',
]);

/**
 * Warns before the tab closes while work would be lost by it.
 *
 * That is any upload not yet finished, a drop still being read and checked
 * before its uploads start, and a running delete. An upload cut off this way
 * is gone, and a multipart one leaves its parts in the bucket. A delete that
 * stops halfway leaves objects behind.
 *
 * This is prevention only: browsers allow just a generic message here, it
 * needs a prior interaction on the page to fire at all, and it does nothing
 * for a crash or a power cut. Those are what the delete recovery record and
 * the bucket's lifecycle rule are for.
 */
export function useUnloadGuard(): void {
  // Booleans, so the many progress updates of a large drop do not re-render
  // the layout this sits in. The loop stops at the first live upload.
  const hasUnfinishedUpload = useUploadStore((state) => {
    for (const id in state.uploads) {
      if (UNFINISHED_UPLOAD_STATUSES.has(state.uploads[id]!.status)) return true;
    }
    return false;
  });
  const hasRunningDelete = useUploadStore((state) =>
    Object.values(state.deletes).some((operation) => operation.status === 'deleting')
  );
  // Being read, checked or planned: the files are not on their way yet, and
  // closing the tab loses the drop.
  const isPreparingDrop = useUploadQueueStore(
    (state) => state.preparingDrops > 0 || state.isPlanning
  );

  const shouldWarn = hasUnfinishedUpload || hasRunningDelete || isPreparingDrop;

  useEffect(() => {
    if (!shouldWarn) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some browsers still need returnValue set before they show the prompt
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [shouldWarn]);
}
