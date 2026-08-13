'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Storage that degrades instead of throwing.
 *
 * zustand's persist lets a storage error propagate out of the set() call, and
 * the record is written from inside the delete itself. Private mode, a blocked
 * cookie policy or a full quota would therefore fail the delete outright,
 * which is far worse than the thing this record exists to soften. Losing the
 * record is an acceptable outcome; losing the delete is not.
 */
const bestEffortStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Nothing to recover with, which the banner simply never shows
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Already unreachable, so there is nothing left to clear
    }
  },
}));

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
    { name: 'delete-recovery-storage', storage: bestEffortStorage }
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
