'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A folder delete that was started and never reported back.
 *
 * Deliberately holds no progress counter. A "we got to object 4,000" number is
 * stale the moment the page reloads, and deleting a key twice is harmless, so
 * the only reliable way to know what is left is to list the prefix again. What
 * we persist is the intent, not the position.
 */
export interface InterruptedDelete {
  id: string;
  /**
   * Pinned at the moment the delete starts. Recovery must never run against a
   * different bucket than the one the delete was aimed at, and with multiple
   * buckets a record can easily outlive a session that has switched.
   */
  bucket: string;
  /** Normalized, always ends with a slash. */
  prefix: string;
  /** What to call it in the prompt. */
  name: string;
  totalItems: number;
  startedAt: number;
}

interface DeleteRecoveryStore {
  records: Record<string, InterruptedDelete>;
  /** Called just before the first batch goes out. */
  recordStarted: (record: InterruptedDelete) => void;
  /**
   * Called once the delete has reported back, whether it finished, failed or
   * was cancelled. A record only survives when nothing reported at all, which
   * is exactly the interrupted case.
   */
  clearRecord: (id: string) => void;
}

export const useDeleteRecoveryStore = create<DeleteRecoveryStore>()(
  persist(
    (set) => ({
      records: {},

      recordStarted: (record) =>
        set((state) => ({
          records: { ...state.records, [record.id]: record },
        })),

      clearRecord: (id) =>
        set((state) => {
          if (!state.records[id]) return state;

          const records = { ...state.records };
          delete records[id];
          return { records };
        }),
    }),
    { name: 'delete-recovery-storage' }
  )
);

/** Records aimed at the given bucket, oldest first. Never crosses buckets. */
export function interruptedDeletesForBucket(
  records: Record<string, InterruptedDelete>,
  bucket: string | null | undefined
): InterruptedDelete[] {
  if (!bucket) return [];

  return Object.values(records)
    .filter((record) => record.bucket === bucket)
    .sort((a, b) => a.startedAt - b.startedAt);
}
