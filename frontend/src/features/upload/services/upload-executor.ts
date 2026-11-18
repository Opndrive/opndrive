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
 *         |  addUpload(file, { key, contentType }) x N
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

import type { UploadStatus } from '@opndrive/s3-api';
import type { PlannedUpload } from '../stores/use-upload-queue-store';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';
import { contentTypeFor } from '../utils/content-type';

/** What the executor needs from an upload manager. */
export interface UploadManagerLike {
  addUpload(file: File, config: { key: string; contentType?: string }): string;
  /** Sends a failed upload again. False when it is not failed, or cannot be. */
  retryUpload(id: string): boolean;
  /** Lets go of a finished upload's file. Leaves one still going alone. */
  discardUpload(id: string): boolean;
  cancelUpload(id: string): Promise<void> | void;
  getStatus(id: string): { status: UploadStatus; progress: number } | undefined;
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
   * `files.length` against the plan's files and empty folders together to see
   * how much got through.
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
  /**
   * The folder's prefix and name, which a retry may have to claim again.
   * Null for loose files, which claim nothing.
   */
  folder: { prefix: string; name: string } | null;
  /** Uploads that ended 'failed' and have not been retried since. */
  failed: Set<string>;
}

/** What came of asking for a retry. */
export type RetryOutcome = { ok: true } | { ok: false; reason: string };

const CANNOT_RETRY = 'This upload can no longer be sent again.';

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
  /**
   * Sends a failed upload again, and keeps its task's books.
   *
   * Straight to the manager, a retry ran with nothing tracking it. The task
   * had counted the upload as finished, so a folder settled while a retried
   * file was still going; and a folder that had settled had given its name
   * back, so its retried files could land under a name another drop had been
   * given since. Here the upload counts as pending again, a settled task is
   * tracked again, and a folder takes its name back first - or the retry is
   * refused, when another drop holds that name now.
   */
  retry(uploadId: string): RetryOutcome;
  /**
   * Whether `retry` could send this upload again: it failed, it is ours, and
   * its folder was not cancelled. For deciding whether to offer Retry at all.
   */
  canRetry(uploadId: string): boolean;
  /**
   * Done with these uploads: their cards have been removed. A failed one's
   * file was kept for a retry nobody can ask for any more, so the manager
   * lets go of it, and the upload is no longer offered as retriable. Ids the
   * manager does not know, such as a folder card's, and uploads still going
   * are passed over.
   */
  discard(uploadIds: readonly string[]): void;
  /**
   * Where an upload stands right now, by the manager's own account.
   *
   * For whoever creates the upload's card, which can only happen after
   * `start` has returned its id. By then the manager has already announced
   * the upload: `addUpload` emits 'queued' and, for the first few files,
   * 'uploading' before it returns, and those events went nowhere because
   * there was no card yet. A card started at 'queued' showed every upload
   * that was already running as waiting.
   */
  statusOf(uploadId: string): { status: UploadStatus; progress: number } | undefined;
  /** Unsubscribes from the manager. Call on session teardown. */
  dispose(): void;
}

export function createUploadExecutor(manager: UploadManagerLike): UploadExecutor {
  const tasks = new Map<string, TaskRecord>();
  const taskByUpload = new Map<string, string>();
  /**
   * Failed uploads of tasks that have settled, so a retry can still find
   * their task. Settling forgets which task an upload belonged to, and a
   * failed upload can still be retried after that. Bounded by the failed
   * uploads, whose files the manager keeps for a retry anyway.
   */
  const retriable = new Map<string, { taskId: string; folder: TaskRecord['folder'] }>();

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

    // A cancelled folder's failures are not offered again.
    if (!record.cancelled) {
      for (const uploadId of record.failed) {
        retriable.set(uploadId, { taskId, folder: record.folder });
      }
    }

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
      if (payload.status === 'failed') record.failed.add(payload.id);
      else record.failed.delete(payload.id);

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

        const emptyFolders = plan.kind === 'folder' ? (plan.emptyFolders ?? []) : [];
        const planned = plan.files.length + emptyFolders.length;

        // Registered BEFORE dispatching, with the full count already in
        // `pending`. Both matter: `addUpload` emits synchronously and starts
        // the queue, so an event for the first file can arrive while the
        // second is still being handed over. Counting up as we went would let
        // `pending` touch zero mid-loop and release the claim underneath a
        // folder that is still being set up.
        const record: TaskRecord = {
          uploadIds: new Set(),
          pending: planned,
          committed: false,
          cancelled: false,
          folder: plan.kind === 'folder' ? { prefix: plan.prefix, name: plan.resolvedName } : null,
          failed: new Set(),
        };
        tasks.set(plan.id, record);

        const files: DispatchedFile[] = [];
        let dispatchError: Error | undefined;

        try {
          for (const file of plan.files) {
            const key = keyForPlannedFile(plan, file);
            // Decided here rather than by the manager, which only knows what
            // the browser said. See contentTypeFor.
            const uploadId = manager.addUpload(file, { key, contentType: contentTypeFor(file) });

            record.uploadIds.add(uploadId);
            taskByUpload.set(uploadId, plan.id);
            files.push({ uploadId, taskId: plan.id, key, file });
          }

          // An empty folder is a zero-byte object named for it, ending in
          // '/' - the same marker "New folder" writes. Uploaded like any
          // other file, so it counts towards the folder's card, its claim
          // and its cancel, and a drop of only empty folders still finishes.
          // No content type: a marker has none, as with "New folder".
          for (const relative of emptyFolders) {
            const key = `${plan.prefix}${relative ? `${relative}/` : ''}`;
            const marker = new File([], relative ? relative.split('/').pop()! : plan.resolvedName);
            const uploadId = manager.addUpload(marker, { key });

            record.uploadIds.add(uploadId);
            taskByUpload.set(uploadId, plan.id);
            files.push({ uploadId, taskId: plan.id, key, file: marker });
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
        record.pending -= planned - record.uploadIds.size;

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

    retry(uploadId) {
      const settled = retriable.get(uploadId);
      const taskId = taskByUpload.get(uploadId) ?? settled?.taskId;
      if (!taskId) return { ok: false, reason: CANNOT_RETRY };

      let record = tasks.get(taskId);
      if (!record) {
        // Settled, and so forgotten: track the task again. Non-null: an
        // upload with no live task can only have been found in `retriable`.
        const { folder } = settled!;
        let committed = false;

        if (folder) {
          // Given back when the folder settled with nothing landed, or
          // forgotten when it was deleted. Taken again, unless another drop
          // has been given it since: two folders' files under one prefix is
          // exactly what claims are for.
          if (!queue().reclaimPrefix(folder.prefix, taskId)) {
            return {
              ok: false,
              reason: `Another upload is using the name "${folder.name}" now, so this one cannot be sent again into it.`,
            };
          }
          committed = queue().claims.some(
            (claim) => claim.taskId === taskId && claim.prefix === folder.prefix && claim.committed
          );
        }

        record = {
          uploadIds: new Set(),
          pending: 0,
          committed,
          cancelled: false,
          folder,
          failed: new Set(),
        };
        tasks.set(taskId, record);
      }

      if (record.cancelled) return { ok: false, reason: CANNOT_RETRY };

      // Counted and routed before the manager is asked, because it announces
      // the retry as it starts it.
      record.uploadIds.add(uploadId);
      taskByUpload.set(uploadId, taskId);
      record.pending++;

      if (!manager.retryUpload(uploadId)) {
        // Not failed after all, or the manager is gone. Undo the count, and
        // settle: a task tracked again only for this lets go of what it took.
        record.pending--;
        settle(taskId);
        return { ok: false, reason: CANNOT_RETRY };
      }

      record.failed.delete(uploadId);
      retriable.delete(uploadId);
      return { ok: true };
    },

    discard(uploadIds) {
      for (const uploadId of uploadIds) {
        // Only a finished upload is let go of. One still going stays
        // tracked, and so does its task.
        if (!manager.discardUpload(uploadId)) continue;

        retriable.delete(uploadId);
        const taskId = taskByUpload.get(uploadId);
        const record = taskId ? tasks.get(taskId) : undefined;
        if (record) {
          // Already counted as finished, so `pending` does not change.
          record.failed.delete(uploadId);
          record.uploadIds.delete(uploadId);
          taskByUpload.delete(uploadId);
        }
      }
    },

    canRetry(uploadId) {
      if (manager.getStatus(uploadId)?.status !== 'failed') return false;

      const taskId = taskByUpload.get(uploadId);
      if (taskId) return !tasks.get(taskId)!.cancelled;

      return retriable.has(uploadId);
    },

    statusOf: (uploadId) => manager.getStatus(uploadId),

    dispose() {
      manager.off('progress', onProgress);
      manager.off('statusChange', onStatusChange);
      tasks.clear();
      taskByUpload.clear();
      retriable.clear();
    },
  };
}
