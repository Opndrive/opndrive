'use client';

import { useEffect } from 'react';
import { useUploadStore } from '../stores/use-upload-store';

/**
 * Warns before the tab closes while a delete is still running.
 *
 * A delete that stops halfway leaves objects behind, so the cheapest fix is to
 * not let it happen quietly. This is prevention only: browsers allow just a
 * generic message here, it needs a prior interaction on the page to fire at
 * all, and it does nothing for a crash or a power cut. Those are what the
 * recovery record is for.
 */
export function useDeleteUnloadGuard(): void {
  const hasRunningDelete = useUploadStore((state) =>
    Object.values(state.deletes).some((operation) => operation.status === 'deleting')
  );

  useEffect(() => {
    if (!hasRunningDelete) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Some browsers still need returnValue set before they show the prompt
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasRunningDelete]);
}
