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
  /**
   * The account the bucket belongs to (`accountKey`: endpoint and access key,
   * no secret). A bucket name is only unique within an account or a server,
   * and with several saved connections a bucket of the same name elsewhere is
   * ordinary - recovery offered there would delete someone else's files.
   * Records written before this field existed have none, and are never offered.
   */
  account?: string;
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
  /** Forgets every record. Signing out of the browser clears them with the keys. */
  clearAll: () => void;
}

export const useDeleteRecoveryStore = create<DeleteRecoveryStore>()(
  persist(
    (set, get) => ({
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

      // Only when there is something to clear: persist writes on every set, and
      // signing out should not rewrite an empty record every time.
      clearAll: () => {
        if (Object.keys(get().records).length > 0) set({ records: {} });
      },
    }),
    { name: 'delete-recovery-storage', storage: bestEffortStorage }
  )
);

/**
 * Records aimed at this bucket in this account, oldest first. Never crosses
 * buckets or accounts, and a record with no account (written before accounts
 * were recorded) matches none: offering it on a same-named bucket in another
 * account would delete the wrong files.
 */
export function interruptedDeletesFor(
  records: Record<string, InterruptedDelete>,
  target: { bucket: string | null | undefined; account: string | null | undefined }
): InterruptedDelete[] {
  if (!target.bucket || !target.account) return [];

  return Object.values(records)
    .filter((record) => record.bucket === target.bucket && record.account === target.account)
    .sort((a, b) => a.startedAt - b.startedAt);
}
