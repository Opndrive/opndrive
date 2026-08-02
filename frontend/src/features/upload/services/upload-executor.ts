'use client';

/**
 * Turns plans into uploads.
 *
 * This is the bridge between `use-upload-queue-store` (which decides WHERE
 * everything goes) and `@opndrive/s3-api`'s UploadManager (which moves the
 * bytes). It deliberately owns very little:
 *
 *   PlannedUpload[]
 *         |
 *         v
 *   [ this executor ]     key mapping, task <-> upload ids, claim lifecycle
 *         |  addUpload(file, { key }) x N
 *         v
 *   UploadManager         THE queue, THE concurrency limit, multipart
 *         |  statusChange / progress
 *         v
 *   upload-context        per-item UI progress (already wired, untouched here)
 *
 * Two things it pointedly does NOT do:
 *
 * 1. It does not keep a queue or a concurrency pool. UploadManager already has
 *    both, and they are covered by their own suite. A second pool here would
 *    mean two components each believing they control how many uploads are in
 *    flight, and "3 at a time" would quietly mean six. Concurrency is
 *    configured where the manager is built, not here.
 * 2. It does not push progress into the UI store. `upload-context.tsx` already
 *    subscribes to the same events and does exactly that. The subscription
 *    below exists only to learn when a claim can be committed.
 */

import type { PlannedUpload } from '../stores/use-upload-queue-store';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';

/** What the executor needs from an upload manager. */
export interface UploadManagerLike {
  addUpload(file: File, config: { key: string }): string;
  cancelUpload(id: string): Promise<void> | void;
  on(event: 'statusChange' | 'progress', listener: (payload: ManagerEvent) => void): void;
  off(event: 'statusChange' | 'progress', listener: (payload: ManagerEvent) => void): void;
}

export interface ManagerEvent {
  id: string;
  status: string;
  progress: number;
  error?: string;
}

/** One dispatched file, so callers can map a plan onto the manager's ids. */
export interface DispatchedFile {
  uploadId: string;
  taskId: string;
  key: string;
  file: File;
}

export interface DispatchResult {
  taskId: string;
  plan: PlannedUpload;
  files: DispatchedFile[];
  /**
   * Set when the manager refused some or all of this plan's files.
   *
   * `addUpload` throws on a disposed manager, which happens for real: logging
   * out or switching bucket mid-drop tears the singleton down. Compare
   * `files.length` against `plan.files.length` to see how much got through.
   */
  dispatchError?: Error;
}

const TERMINAL = ['completed', 'failed', 'cancelled'];

/**
 * The S3 key for one file of a plan.
 *
 * The subtle half of this whole layer. Extraction stamps every dropped file
 * with a `webkitRelativePath` that STARTS WITH THE DROPPED FOLDER'S NAME
 * ("photos/holiday/a.jpg"), while `PlannedUpload.prefix` already ends with the
 * folder's RESOLVED name ("docs/photos (1)/"). Concatenating the two gives
 *
 *     docs/photos (1)/photos/holiday/a.jpg
 *
 * which is both nested one level too deep and, worse, silently undoes the
 * collision rename: the user asked for "photos (1)" and got a wrapper around a
 * folder still called "photos", colliding exactly as before one level down.
 *
 * So the first segment is dropped. This is also why the executor calls
 * `addUpload` per file rather than `addFolderUpload`, which builds this same
 * broken key internally and cannot be told otherwise.
 */
export function keyForPlannedFile(plan: PlannedUpload, file: File): string {
  if (plan.kind === 'file') {
    // Loose files were never nested; their name is the whole key.
    return `${plan.prefix}${file.name}`;
  }

  const relativePath =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

  // Normalise BEFORE stripping, because both of these defeat a naive strip and
  // both produce keys S3 will happily store:
  //
  //   "/photos/a.jpg"  - a leading slash makes the first segment empty, so the
  //                      strip removes nothing and the folder name survives
  //                      into the key: exactly the double-nesting this function
  //                      exists to prevent, just harder to spot.
  //   "photos//a.jpg"  - a repeated slash is a real, empty path segment to S3,
  //                      giving an object that most tools cannot address.
  //
  // Backslashes are deliberately left alone: they are legal in a POSIX
  // filename, so rewriting them would corrupt names rather than fix paths.
  const normalised = relativePath.replace(/\/{2,}/g, '/').replace(/^\/+/, '');

  const firstSlash = normalised.indexOf('/');
  const withoutDroppedRoot = firstSlash === -1 ? normalised : normalised.slice(firstSlash + 1);

  // Empty means the path was nothing but the dropped folder name (or nothing at
  // all). Falling through would make the key equal the prefix, creating a
  // zero-byte object shadowing the folder itself.
  //
  // A file sitting directly in the dropped folder has no slash left, which IS
  // correct - it belongs at the root of the resolved prefix.
  return `${plan.prefix}${withoutDroppedRoot || file.name}`;
}

interface TaskRecord {
  uploadIds: Set<string>;
  /** Uploads not yet in a terminal state. */
  pending: number;
  /** Set once bytes have provably landed, so the claim must never be released. */
  committed: boolean;
  cancelled: boolean;
}

export interface UploadExecutor {
  /** Dispatches every plan and returns the manager ids it produced. */
  start(plans: readonly PlannedUpload[]): DispatchResult[];
  /** Cancels every upload belonging to a task, freeing its claim if nothing landed. */
  cancelTask(taskId: string): Promise<void>;
  /**
   * Task id owning an upload.
   *
   * Undefined once the task is fully terminal: routing state is dropped the
   * moment it stops being needed, so this is deliberately not a history API.
   * The UI store keeps the record a panel needs.
   */
  taskFor(uploadId: string): string | undefined;
  /** Manager ids still tracked for a task. Empty once the task is terminal. */
  uploadsFor(taskId: string): string[];
  /** Unsubscribes from the manager. Call on session teardown. */
  dispose(): void;
}

export function createUploadExecutor(manager: UploadManagerLike): UploadExecutor {
  const tasks = new Map<string, TaskRecord>();
  const taskByUpload = new Map<string, string>();

  const queue = () => useUploadQueueStore.getState();

  /**
   * Marks a task's prefix as permanently taken.
   *
   * Called the moment bytes provably reach S3, NOT when the upload starts.
   * `CreateMultipartUpload` writes no visible object, so committing there would
   * mean an upload that failed immediately afterwards kept its prefix locked
   * for the rest of the session with nothing stored under it - the exact leak
   * releasable claims exist to prevent.
   */
  const commitOnce = (taskId: string) => {
    const record = tasks.get(taskId);
    if (!record || record.committed) return;

    record.committed = true;
    queue().commitClaim(taskId);
  };

  /**
   * Drops a finished task's routing state.
   *
   * Without this the two maps only ever grow: a session that uploads ten
   * thousand files keeps ten thousand id entries alive for as long as the tab
   * is open, long after the last of them finished. Nothing here pins a File,
   * so it is not the s3-api leak over again, but it is still unbounded.
   *
   * Late events for a forgotten id fall out at the `taskFor` lookup, which is
   * what makes this safe - a duplicate terminal event after teardown is
   * indistinguishable from an event for another component's upload, and both
   * are correctly ignored.
   */
  const forget = (taskId: string, record: TaskRecord) => {
    for (const uploadId of record.uploadIds) taskByUpload.delete(uploadId);
    tasks.delete(taskId);
  };

  const settle = (taskId: string) => {
    const record = tasks.get(taskId);
    if (!record || record.pending > 0) return;

    // Every upload finished and none of them ever moved a byte, so the name is
    // genuinely free again. A committed task keeps its claim; releaseClaim
    // would refuse anyway, but not calling it says so more clearly.
    if (!record.committed) queue().releaseClaim(taskId);

    forget(taskId, record);
  };

  const onProgress = (payload: ManagerEvent) => {
    const taskId = taskByUpload.get(payload.id);
    // Progress only proves bytes landed once it is above zero: the manager
    // emits an initial 0 when an item starts, which is exactly the moment that
    // must NOT commit.
    if (taskId && payload.progress > 0) commitOnce(taskId);
  };

  const onStatusChange = (payload: ManagerEvent) => {
    const taskId = taskByUpload.get(payload.id);
    // Not ours. The manager is shared, so other work's events arrive here too.
    if (!taskId) return;

    // Non-null: an id only enters taskByUpload after its task's record exists,
    // and both maps are cleared together in dispose.
    const record = tasks.get(taskId)!;

    // A small file can go straight to 'completed' without a separate progress
    // event, so completion commits too.
    if (payload.status === 'completed') commitOnce(taskId);

    if (TERMINAL.includes(payload.status)) {
      record.pending = Math.max(0, record.pending - 1);
      settle(taskId);
    }
  };

  manager.on('progress', onProgress);
  manager.on('statusChange', onStatusChange);

  return {
    start(plans) {
      const results: DispatchResult[] = [];

      for (const plan of plans) {
        // A task id is dispatched once. Overwriting the record would orphan the
        // first attempt's uploads: they would still route to this task id, so
        // their terminal events would decrement the NEW record and settle it
        // early, releasing a prefix the second attempt is still uploading into
        // - and cancelTask could no longer reach them.
        if (tasks.has(plan.id)) {
          results.push({
            taskId: plan.id,
            plan,
            files: [],
            dispatchError: new Error(`Task ${plan.id} has already been dispatched.`),
          });
          continue;
        }

        // Registered BEFORE dispatching, with the full file count already in
        // `pending`. Both matter: `addUpload` emits synchronously and starts
        // the queue, so an event for the first file can arrive while the
        // second is still being handed over. Counting up as we went would let
        // `pending` touch zero mid-loop and release the claim underneath a
        // folder that is still being set up.
        const record: TaskRecord = {
          uploadIds: new Set(),
          pending: plan.files.length,
          committed: false,
          cancelled: false,
        };
        tasks.set(plan.id, record);

        const files: DispatchedFile[] = [];
        let dispatchError: Error | undefined;

        try {
          for (const file of plan.files) {
            const key = keyForPlannedFile(plan, file);
            const uploadId = manager.addUpload(file, { key });

            record.uploadIds.add(uploadId);
            taskByUpload.set(uploadId, plan.id);
            files.push({ uploadId, taskId: plan.id, key, file });
          }
        } catch (error) {
          // The manager refused the rest of this plan - disposal mid-drop is
          // the real case. Nothing is thrown onward: the remaining plans still
          // deserve their turn, exactly as planning refuses to abandon later
          // folders when an earlier one has trouble.
          dispatchError = error instanceof Error ? error : new Error(String(error));
        }

        // Discount the files the manager never accepted. Left at the planned
        // total, a half-dispatched task could never reach zero and would squat
        // its prefix for the rest of the session.
        //
        // Subtracted rather than assigned: a file dispatched earlier in this
        // same loop may have already finished and decremented `pending`, and
        // assigning the dispatched count would resurrect it.
        record.pending -= plan.files.length - record.uploadIds.size;

        results.push({ taskId: plan.id, plan, files, dispatchError });

        // Covers a plan with no files, a plan the manager rejected outright,
        // and one whose files all finished during dispatch. Without it, none of
        // those would ever see an event and their names would leak.
        settle(plan.id);
      }

      return results;
    },

    async cancelTask(taskId) {
      const record = tasks.get(taskId);
      if (!record) return;

      record.cancelled = true;

      // allSettled: one upload whose AbortMultipartUpload fails must not stop
      // the rest of the folder from being cancelled.
      await Promise.allSettled(
        [...record.uploadIds].map(async (uploadId) => manager.cancelUpload(uploadId))
      );

      // Cancellation does not itself release: an upload that already wrote
      // parts has bytes at that prefix, and handing the name back would let a
      // later drop overwrite them. commitOnce decides that, not this.
      if (!record.committed) queue().releaseClaim(taskId);
    },

    taskFor: (uploadId) => taskByUpload.get(uploadId),

    uploadsFor: (taskId) => [...(tasks.get(taskId)?.uploadIds ?? [])],

    dispose() {
      manager.off('progress', onProgress);
      manager.off('statusChange', onStatusChange);
      tasks.clear();
      taskByUpload.clear();
    },
  };
}
