// UploadManager.ts (Corrected and Final)
import { S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { MultipartUploader } from './multipartUploader.js';
import {
  DEFAULT_RETRY_DELAYS_MS,
  failedOffline,
  isTransientUploadError,
  waitBeforeRetry,
} from './retry.js';
import { folderUploadKey, isDroppedFolderEntry } from './folder-entries.js';
import {
  UploadItem,
  UploadStatus,
  UploadManagerConfig,
  UploadEvent,
  EventListener,
  EventPayload,
} from '../core/types.js';

/**
 * One worker's run of an upload.
 *
 * Owning the upload and holding a concurrency slot are separate. A failed
 * worker still holds its slot while it aborts the upload on the server, and
 * Retry can be pressed in that time: the upload moves on to a new worker, and
 * the old one still has to give its slot back when the abort ends.
 */
interface Worker {
  holdsSlot: boolean;
  /** Fired when the upload is taken away, so a wait to retry ends at once. */
  stop: AbortController;
}

export class UploadManager {
  private static instance: UploadManager | undefined;
  private s3: S3Client;
  private prefix: string = ''; // Base prefix from config
  private bucket: string = ''; // Bucket from config
  private uploads = new Map<string, UploadItem>();
  private queue: string[] = [];
  private activeUploads = 0;
  private maxConcurrency: number; // Max files to upload at once
  private partSize: number;
  private retryDelaysMs: readonly number[];
  // Set once this instance has been superseded by disposeInstance(). getInstance()
  // silently discards its config once an instance exists, so a stale manager left
  // over from a previous session/bucket must refuse new work rather than upload to
  // credentials the caller no longer intends to use.
  private isDisposed = false;

  // --- Part Concurrency ---
  // This is the max parts for a SINGLE file upload.
  private readonly partConcurrency = 3;

  private listeners = new Map<UploadEvent, Set<EventListener>>();

  /**
   * The worker each upload belongs to, by upload id.
   *
   * Pausing or cancelling takes an upload away from its worker, and resuming
   * hands it to a new one. The old worker can still be running: waiting to
   * retry, or on a request that has not come back yet. It checks this before
   * doing anything, and stops if the upload is no longer its own. Otherwise a
   * pause and resume during a retry's wait left two workers sending the same
   * file, each finishing it and each handing back a concurrency slot.
   */
  private workers = new Map<string, Worker>();

  private constructor(config: UploadManagerConfig) {
    this.s3 = config.s3;
    this.prefix = config.prefix;
    this.bucket = config.bucket;
    // Sets the max number of concurrent FILE uploads.
    this.maxConcurrency = config.maxConcurrency ?? 2;
    this.partSize = (config.partSizeMB ?? 5) * 1024 * 1024;
    this.retryDelaysMs = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  public static getInstance(config: UploadManagerConfig): UploadManager {
    if (!UploadManager.instance) {
      UploadManager.instance = new UploadManager(config);
    }
    return UploadManager.instance;
  }

  /**
   * Tears down the current singleton so the next getInstance() call builds a
   * fresh manager bound to new credentials.
   *
   * Must be called whenever a session ends or changes bucket - getInstance()
   * silently ignores its config argument once an instance already exists, so
   * without this, uploads keep going to whichever bucket was connected first.
   *
   * Clears the static reference synchronously (before any awaiting), so a
   * getInstance() call made immediately after is guaranteed a fresh instance
   * regardless of how long in-flight cancellation takes. Never throws - safe
   * to call without awaiting from a synchronous caller such as logout.
   */
  public static async disposeInstance(): Promise<void> {
    const existing = UploadManager.instance;
    UploadManager.instance = undefined;
    if (!existing) return;

    existing.isDisposed = true;
    try {
      await existing.cancelAllUploads();
    } catch (err) {
      console.error('Failed to cleanly cancel in-flight uploads during dispose:', err);
    }
  }

  /**
   * Cancels every queued, uploading, or paused item; leaves completed/failed/
   * cancelled alone.
   *
   * Uses allSettled rather than all: a failed AbortMultipartUpload leaves an
   * orphaned multipart upload accruing storage charges, so every failure has to
   * be surfaced individually instead of the first rejection masking the rest.
   */
  private async cancelAllUploads(): Promise<void> {
    const ids = Array.from(this.uploads.entries())
      .filter(([, item]) => ['queued', 'uploading', 'paused'].includes(item.status))
      .map(([id]) => id);

    const results = await Promise.allSettled(ids.map((id) => this.cancelUpload(id)));

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(
          `Failed to cancel upload ${ids[i]} during dispose. If a multipart ` +
            'upload was in progress it may now be orphaned in the bucket:',
          result.reason
        );
      }
    });
  }

  // --- Event Emitter Methods (Unchanged) ---
  public on(event: UploadEvent, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  public off(event: UploadEvent, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * CORRECTED: Adds a file to the upload queue.
   * The concurrency for the uploader is now a fixed value, not the manager's concurrency.
   */
  public addUpload(file: File, config: { key: string; contentType?: string }): string {
    if (this.isDisposed) {
      throw new Error(
        'This UploadManager instance has been disposed. Obtain a new one via getInstance().'
      );
    }

    const id = uuidv4();

    const uploadItem: UploadItem = {
      id,
      file,
      uploader: this.uploaderFor(file, config),
      config,
      status: 'queued',
      progress: 0,
    };

    this.uploads.set(id, uploadItem);
    this.queue.push(id);
    this.emitStatusChange(id, 'queued', 0);
    this.processQueue();

    return id;
  }

  /** A fresh uploader for one file, for a new upload or a retry of a failed one. */
  private uploaderFor(file: File, config: UploadItem['config']): MultipartUploader {
    return new MultipartUploader({
      s3: this.s3,
      bucket: this.bucket,
      key: config.key,
      fileName: file.name,
      partSizeBytes: this.partSize,
      concurrency: this.partConcurrency,
      contentType: config.contentType,
    });
  }

  /**
   * Sends a failed upload again, from the start.
   *
   * Failures that may clear by themselves are already retried automatically,
   * so what reaches 'failed' is either one that did not, or one that kept
   * failing. Either way the person can see why, and this is how they say "try
   * that again". A new uploader is built because the failed one's session was
   * aborted (see abandon()); the file was kept for exactly this.
   *
   * @returns false when there is nothing to retry: the upload is not failed,
   *   or this manager has been disposed.
   */
  public retryUpload(id: string): boolean {
    if (this.isDisposed) return false;

    const item = this.uploads.get(id);
    if (!item || item.status !== 'failed' || !item.file) return false;

    item.uploader = this.uploaderFor(item.file, item.config);
    item.error = undefined;

    this.updateItemStatus(id, 'queued', 0);
    this.queue.push(id);
    this.processQueue();

    return true;
  }

  /**
   * CORRECTED: Adds a folder to the upload queue.
   * This method no longer duplicates code and correctly uses its config.
   * It now calls `addUpload` for each file.
   */
  public addFolderUpload(
    files: FileList,
    config: { basePrefix?: string }
  ): { folderId: string; fileIds: string[] } {
    const folderId = uuidv4();
    const fileIds: string[] = [];

    for (const file of Array.from(files)) {
      if (isDroppedFolderEntry(file)) continue;

      const fileId = this.addUpload(file, { key: folderUploadKey(file, config.basePrefix) });
      fileIds.push(fileId);
    }

    return { folderId, fileIds };
  }

  // --- All other methods (pause, resume, cancel, processQueue, etc.) remain the same ---
  /**
   * Drops the memory-heavy references on an item that has finished.
   *
   * The item itself stays in `uploads` - getStatus() and getAllStatuses() are
   * documented to keep answering for finished work, and the upload worker's
   * `finally` reads the map to decide whether to free a concurrency slot, so
   * deleting the entry outright would both break the public contract and
   * deadlock the queue once maxConcurrency items had completed.
   *
   * What actually leaked is the payload: a File pins an OS handle, and a
   * MultipartUploader holds its part bookkeeping. Ten thousand finished
   * uploads held ten thousand of each until logout.
   *
   * Only ever called on a terminal item. Paused items must keep their
   * resources - resumeUpload() needs the uploader's in-progress uploadId.
   */
  private releaseResources(id: string): void {
    const item = this.uploads.get(id);
    if (!item) return;

    item.file = undefined;
    item.uploader = undefined;
  }

  /**
   * Lets go of a finished upload's file and uploader, for a caller that is
   * done with it: its card has been removed, say.
   *
   * A failed upload keeps its file so it can be retried, and before this
   * nothing else ever released it: removing the card left the File held
   * until logout. Its status still answers afterwards, but it can no longer
   * be retried. An upload still queued, running or paused is left alone.
   *
   * @returns whether the upload was finished, and so released.
   */
  public discardUpload(id: string): boolean {
    const item = this.uploads.get(id);
    if (!item || !['completed', 'failed', 'cancelled'].includes(item.status)) return false;

    this.releaseResources(id);
    return true;
  }

  public pauseUpload(id: string): void {
    const item = this.uploads.get(id);
    if (!item || item.status !== 'uploading') return;

    // Non-null: resources are released only on terminal states, and this item
    // is 'uploading'.
    item.uploader!.pause();
    this.takeFromWorker(id);
    this.updateItemStatus(id, 'paused');
    this.processQueue();
  }

  public async resumeUpload(id: string): Promise<void> {
    if (this.isDisposed) return;

    const item = this.uploads.get(id);
    if (!item || item.status !== 'paused') return;

    this.updateItemStatus(id, 'queued');
    this.queue.unshift(id);
    this.processQueue();
  }

  public async cancelUpload(id: string): Promise<void> {
    const item = this.uploads.get(id);
    if (!item) return;

    const previousStatus = item.status;

    // Already terminal - nothing to cancel, and going on would announce a
    // second, contradictory end for it.
    if (previousStatus === 'completed' || previousStatus === 'failed') return;
    if (previousStatus === 'cancelled') return;

    // Too late: S3 has been asked to put the file together, and a cancel
    // cannot stop that, only race it. When the completion won, the file was
    // stored under an upload said to be cancelled. It is left to finish, and
    // says so when it does.
    if (previousStatus === 'uploading' && item.uploader?.isCompleting) return;

    const queueIndex = this.queue.indexOf(id);
    if (queueIndex > -1) {
      this.queue.splice(queueIndex, 1);
    }

    // Mark terminal BEFORE awaiting the uploader. uploader.cancel() performs a
    // network round-trip (AbortMultipartUpload), and while it is in flight the
    // upload worker unwinds and resolves normally - it would otherwise still
    // see status 'uploading' and transition the item to 'completed', emitting a
    // bogus success event for an upload the caller just cancelled.
    this.updateItemStatus(id, 'cancelled');
    this.takeFromWorker(id);

    try {
      if (previousStatus === 'uploading' || previousStatus === 'paused') {
        // Non-null: 'uploading' and 'paused' are both pre-terminal.
        await item.uploader!.cancel();
      }
    } finally {
      // In a finally so a failed AbortMultipartUpload still frees the file
      // handle. The rejection continues to propagate - cancelAllUploads()
      // reports each one individually.
      this.releaseResources(id);
    }

    this.processQueue();
  }

  public getStatus(id: string): { status: UploadStatus; progress: number } | undefined {
    const item = this.uploads.get(id);
    return item ? { status: item.status, progress: item.progress } : undefined;
  }

  public getAllStatuses(): Record<string, { status: UploadStatus; progress: number }> {
    const allStatuses: Record<string, { status: UploadStatus; progress: number }> = {};
    for (const [id, item] of this.uploads.entries()) {
      allStatuses[id] = { status: item.status, progress: item.progress };
    }
    return allStatuses;
  }

  private async processQueue(): Promise<void> {
    // cancelUpload() calls this after every cancellation, including the mass
    // cancellation inside disposeInstance(). Without this guard, cancelling a
    // queued item would pull the NEXT queued item off and start uploading it to
    // the very bucket being torn down.
    if (this.isDisposed) return;

    if (this.activeUploads >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const id = this.queue.shift()!;
    const item = this.uploads.get(id);

    if (!item || item.status !== 'queued') {
      this.processQueue();
      return;
    }

    const worker: Worker = { holdsSlot: true, stop: new AbortController() };
    this.workers.set(id, worker);
    this.activeUploads++;
    this.updateItemStatus(id, 'uploading');

    // Whether this worker still has the upload. See `workers`.
    const ownsUpload = () => this.workers.get(id) === worker;

    (async () => {
      try {
        const onProgress = (progress: number) => {
          item.progress = progress;
          this.emit('progress', { id, status: item.status, progress });
        };

        let retriesUsed = 0;
        let lastFailedPart: number | undefined;
        for (;;) {
          const progressBefore = item.progress;
          try {
            await this.runAttempt(item, onProgress);
            break;
          } catch (err) {
            // Paused or cancelled underneath this attempt, which is what
            // ended it. Not a failure, and not this worker's to retry.
            if (!ownsUpload()) return;

            // Retries are for an upload that is stuck. One whose last attempt
            // got further is moving, and the parts it sent are kept, so it has
            // its retries back. Counted over the whole upload instead, four
            // short drops in the hours of a big one failed it outright, and
            // aborted every part it had sent.
            //
            // Unless the same part failed again. The others going up is
            // progress, but a part that fails every time is stuck however
            // often they do, and given the retries back after every few
            // parts, a 10,000-part file came back to it thousands of times.
            const failedPart = item.uploader?.failedPart;
            const samePartAgain = failedPart !== undefined && failedPart === lastFailedPart;
            if (item.progress > progressBefore && !samePartAgain) retriesUsed = 0;
            lastFailedPart = failedPart;

            // Failing while the browser says it is offline is the network's
            // doing, not the upload's, so it spends no retry: the upload
            // waits for the network instead, however long that takes, and
            // tries again every so often in case the browser has it wrong.
            const offline = failedOffline(err);
            if (!offline && !this.shouldRetry(id, err, retriesUsed)) throw err;

            const delayMs = offline ? 0 : this.retryDelaysMs[retriesUsed++]!;
            console.warn(
              offline
                ? `Upload ${id} lost its connection, waiting for the network:`
                : `Upload ${id} failed, retrying (${retriesUsed} of ${this.retryDelaysMs.length}):`,
              err
            );
            await waitBeforeRetry(delayMs, { signal: worker.stop.signal });

            // Paused, cancelled or torn down while waiting, and perhaps
            // resumed since, by a worker of its own. Either way there is
            // nothing left for this one to do.
            if (this.isDisposed || !ownsUpload()) return;
          }
        }

        if (ownsUpload() && this.uploads.get(id)?.status === 'uploading') {
          this.updateItemStatus(id, 'completed', 100);
        }
      } catch (err) {
        // Not owned any more means paused or cancelled, which is no failure.
        if (ownsUpload()) {
          console.error(`Upload failed for ${id}:`, err);

          // Failed, the upload is free to be retried, so it is no longer this
          // worker's: let go of it before saying so, and a retry gets a worker
          // of its own. The slot is kept until the abort below is done.
          this.workers.delete(id);
          const uploader = item.uploader;
          this.updateItemStatus(
            id,
            'failed',
            item.progress,
            err instanceof Error ? err.message : String(err)
          );
          await this.abandon(id, uploader);

          // Done with. The file stays, so it can be retried - unless a retry
          // has already given the item an uploader of its own.
          if (item.uploader === uploader) item.uploader = undefined;
        }
      } finally {
        // 'cancelled' and 'paused' are not handled here: they took the upload
        // and freed the slot themselves. 'paused' keeps its resources so it
        // can resume.
        if (ownsUpload() && this.uploads.get(id)?.status === 'completed') {
          this.workers.delete(id);
          this.releaseResources(id);
        }

        if (worker.holdsSlot) {
          this.freeSlot(worker);
          this.processQueue();
        }
      }
    })();
  }

  /**
   * One go at the upload: a fresh start, or a resume of a multipart session
   * that is already open - after a pause, or after an attempt that failed.
   * Resuming is what makes a retry cheap: the parts already on S3 stay there.
   */
  private async runAttempt(item: UploadItem, onProgress: (progress: number) => void) {
    // Non-null: the item is 'uploading', and an uploader is only released once
    // an item is finished.
    const uploader = item.uploader!;

    if (uploader['uploadId']) {
      await uploader.resume(item.file!, onProgress);
    } else {
      await uploader.start(item.file!, onProgress);
    }
  }

  /**
   * Takes an upload off its worker for a pause or a cancel, and frees the
   * slot that worker held. The worker sees it has lost the upload and stops.
   *
   * A failed worker has already let go of its upload, so a retry cancelled
   * while that worker is still aborting leaves the slot with it: freeing it
   * here would start the next upload before the abort was done.
   */
  private takeFromWorker(id: string): void {
    const worker = this.workers.get(id);
    this.workers.delete(id);
    if (!worker) return;

    worker.stop.abort();
    this.freeSlot(worker);
  }

  /** Gives back a worker's concurrency slot, once. */
  private freeSlot(worker: Worker): void {
    if (!worker.holdsSlot) return;
    worker.holdsSlot = false;
    this.activeUploads--;
  }

  /** Whether a failed attempt gets another go. */
  private shouldRetry(id: string, err: unknown, attempt: number): boolean {
    return (
      attempt < this.retryDelaysMs.length &&
      !this.isDisposed &&
      this.uploads.get(id)?.status === 'uploading' &&
      isTransientUploadError(err)
    );
  }

  /**
   * Aborts a failed upload on the server.
   *
   * Nothing resumes a failed upload - its uploader is released straight after
   * this - so the parts it had already sent would otherwise sit in the bucket
   * for good: billed, and invisible to every listing. Only a lifecycle rule
   * would ever remove them.
   *
   * Awaited before the concurrency slot is freed, so the next upload does not
   * start while this one's cleanup is still on the wire. A failed abort is
   * reported, not thrown: the upload has already failed, and the dropped
   * connection that failed it is the likeliest reason the abort cannot get
   * through either.
   */
  private async abandon(id: string, uploader: MultipartUploader | undefined): Promise<void> {
    try {
      await uploader?.cancel();
    } catch (err) {
      console.error(
        `Could not abort failed upload ${id}. Its parts may be left in the bucket:`,
        err
      );
    }
  }

  private updateItemStatus(
    id: string,
    status: UploadStatus,
    progress?: number,
    error?: string
  ): void {
    const item = this.uploads.get(id);
    if (!item) return;

    item.status = status;
    if (progress !== undefined) item.progress = progress;
    if (error !== undefined) item.error = error;

    this.emitStatusChange(id, status, item.progress, error);
  }

  /**
   * Listeners are isolated from each other: a subscriber that throws must not
   * break the emit loop. This matters most during disposeInstance(), where a
   * single throwing listener would otherwise propagate up through
   * updateItemStatus -> cancelUpload and leave the remaining uploads running.
   */
  private emit(event: UploadEvent, payload: EventPayload): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error(`Upload event listener for "${event}" threw:`, err);
      }
    });
  }

  private emitStatusChange(id: string, status: UploadStatus, progress: number, error?: string) {
    this.emit('statusChange', { id, status, progress, error });
  }
}
