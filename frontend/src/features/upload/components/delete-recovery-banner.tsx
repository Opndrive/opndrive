'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useNotification } from '@/context/notification-context';
import { useDeleteOperations } from '../hooks/use-delete-operations';
import { useDeletedFolderCleanup } from '../hooks/use-deleted-folder-cleanup';
import { markerLast } from '../utils/delete-key-order';
import {
  useDeleteRecoveryStore,
  interruptedDeletesForBucket,
  type InterruptedDelete,
} from '../stores/use-delete-recovery-store';

type Stage =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirm'; remaining: string[] }
  | { kind: 'deleting' };

/**
 * Shown when a folder delete was started and never reported back, which in
 * practice means the tab went away mid-run.
 *
 * Recovery is a fresh listing rather than a replay: whatever is still under the
 * prefix is what is left, and deleting an already-deleted key is a no-op. That
 * also means the count has to be confirmed before anything is deleted, because
 * files created under that prefix since the interruption would be caught by a
 * blind resume.
 */
export function DeleteRecoveryBanner() {
  const { apiS3 } = useAuthGuard();
  const records = useDeleteRecoveryStore((state) => state.records);

  // Records for other buckets stay untouched, ready for whenever that session
  // comes back
  const record = interruptedDeletesForBucket(records, apiS3?.getBucketName())[0];

  if (!apiS3 || !record) {
    return null;
  }

  // Keyed so the prompt's state cannot outlive the record it belongs to.
  // Buckets are switched in place with no reload, and a confirm step still
  // holding the previous bucket's key list would delete those names in the
  // bucket the user just moved to.
  return <RecoveryPrompt key={record.id} record={record} apiS3={apiS3} />;
}

function RecoveryPrompt({
  record,
  apiS3,
}: {
  record: InterruptedDelete;
  apiS3: { listFromPrefix: (prefix: string) => Promise<string[]> };
}) {
  const { success: notifySuccess, error: notifyError } = useNotification();
  const { batchDeleteByKeys } = useDeleteOperations();
  const clearRecord = useDeleteRecoveryStore((state) => state.clearRecord);
  const cleanUpDeletedFolder = useDeletedFolderCleanup();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  const check = async () => {
    setStage({ kind: 'checking' });

    try {
      const remaining = await apiS3.listFromPrefix(record.prefix);

      if (remaining.length === 0) {
        notifySuccess(`"${record.name}" was fully deleted, nothing was left behind.`);
        clearRecord(record.id);
        // The delete did land before the tab went away, so the folder can still
        // be sitting in listings loaded since, or under the user's feet.
        cleanUpDeletedFolder(record.prefix);
        setStage({ kind: 'idle' });
        return;
      }

      setStage({ kind: 'confirm', remaining });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read the folder';
      notifyError(`Could not check "${record.name}": ${message}`);
      setStage({ kind: 'idle' });
    }
  };

  const finish = async (remaining: string[]) => {
    setStage({ kind: 'deleting' });

    try {
      await batchDeleteByKeys(markerLast(remaining, record.prefix));
      clearRecord(record.id);
      // Recovery usually runs from wherever the reload landed, which can be
      // inside the folder it is deleting.
      cleanUpDeletedFolder(record.prefix);
      notifySuccess(`Finished deleting "${record.name}".`);
    } catch {
      // batchDeleteByKeys reports its own failures, and the record stays so the
      // user can try again
    } finally {
      setStage({ kind: 'idle' });
    }
  };

  const busy = stage.kind === 'checking' || stage.kind === 'deleting';

  return (
    <div
      role="status"
      className="mb-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {stage.kind === 'confirm'
              ? `${stage.remaining.length} item${stage.remaining.length === 1 ? '' : 's'} still left in "${record.name}"`
              : `Deleting "${record.name}" did not finish`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stage.kind === 'confirm'
              ? 'Anything added to this folder since then would be deleted too. Check before continuing.'
              : `It was removing ${record.totalItems} item${record.totalItems === 1 ? '' : 's'} when the tab closed, so some may still be there.`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        {stage.kind === 'confirm' ? (
          <>
            <Button size="sm" onClick={() => finish(stage.remaining)} disabled={busy}>
              Delete {stage.remaining.length} item{stage.remaining.length === 1 ? '' : 's'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStage({ kind: 'idle' })}
              disabled={busy}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={check} disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {stage.kind === 'deleting' ? 'Deleting...' : 'Check what is left'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => clearRecord(record.id)}
              disabled={busy}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
