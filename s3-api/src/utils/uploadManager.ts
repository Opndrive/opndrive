// UploadManager.ts (Corrected and Final)
import { S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { MultipartUploader } from './multipartUploader.js';
import {
  UploadItem,
  UploadStatus,
  UploadManagerConfig,
  UploadEvent,
  EventListener,
  EventPayload,
} from '../core/types.js';

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
  // Set once this instance has been superseded by disposeInstance(). getInstance()
  // silently discards its config once an instance exists, so a stale manager left
  // over from a previous session/bucket must refuse new work rather than upload to
  // credentials the caller no longer intends to use.
  private isDisposed = false;
  // Whether a deferred queue pump is already booked. See schedulePump().
  private pumpScheduled = false;

  // --- Part Concurrency ---
  // This is the max parts for a SINGLE file upload.
  private readonly partConcurrency = 3;

  private listeners = new Map<UploadEvent, Set<EventListener>>();

  private constructor(config: UploadManagerConfig) {
    this.s3 = config.s3;
    this.prefix = config.prefix;
    this.bucket = config.bucket;
    // Sets the max number of concurrent FILE uploads.
    this.maxConcurrency = config.maxConcurrency ?? 2;
    this.partSize = (config.partSizeMB ?? 5) * 1024 * 1024;
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
  public addUpload(file: File, config: { key: string }): string {
    if (this.isDisposed) {
      throw new Error(
        'This UploadManager instance has been disposed. Obtain a new one via getInstance().'
      );
    }

    const id = uuidv4();
    const uploader = new MultipartUploader({
      s3: this.s3,
      bucket: this.bucket,
      key: config.key,
      fileName: file.name,
      partSizeBytes: this.partSize,
      concurrency: this.partConcurrency,
    });

    const uploadItem: UploadItem = {
      id,
      file,
      uploader,
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
      if (file.size === 0 && file.type === '') continue;

      let key = '';

      if (!config.basePrefix) {
        key = file.webkitRelativePath;
      } else {
        key = `${config.basePrefix}${file.webkitRelativePath}`;
      }

      const fileId = this.addUpload(file, { key });
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

  public pauseUpload(id: string): void {
    const item = this.uploads.get(id);
    if (!item || item.status !== 'uploading') return;

    // Non-null: resources are released only on terminal states, and this item
    // is 'uploading'.
    item.uploader!.pause();
    this.activeUploads--;
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

    // Already terminal - nothing to cancel, and re-running the bookkeeping
    // below would double-decrement activeUploads.
    if (previousStatus === 'completed' || previousStatus === 'failed') return;
    if (previousStatus === 'cancelled') return;

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

    // The worker's `finally` only decrements for completed/failed, so once the
    // status is 'cancelled' this bookkeeping becomes ours.
    if (previousStatus === 'uploading') {
      this.activeUploads--;
    }

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

    this.schedulePump();
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

  /**
   * Refills the slots a cancellation freed - but not until the caller has
   * finished cancelling.
   *
   * Cancelling a folder means cancelling its files one after another, and for
   * the whole of that pass the queue is still full of files that are about to
   * be cancelled too. Pumping the queue from inside cancelUpload() handed the
   * freed slots straight to them: each one STARTED - CreateMultipartUpload,
   * CORS preflight and all - a moment before its own cancellation reached it.
   * Cancelling a few thousand files therefore fired off roughly half that many
   * uploads it then had to abort, which is what locked the tab up for a moment,
   * and the ones still waiting on CreateMultipartUpload had no uploadId for
   * cancel() to abort with, so they were left orphaned in the bucket accruing
   * storage charges.
   *
   * A microtask is late enough to land after any synchronous cancel pass, by
   * which point every cancelled file has been marked and spliced out of the
   * queue so only somebody else's work is left to start, and early enough that
   * a single cancel still refills its slot within the same tick. Deferring
   * rather than skipping is what makes this hold for callers that cancel
   * without awaiting, which the folder cards do.
   */
  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;

    queueMicrotask(() => {
      this.pumpScheduled = false;
      // processQueue() starts at most one upload, so it takes one call per
      // slot the cancellations freed. The bound is read once, before any of
      // them runs; calls beyond what the queue can fill return immediately.
      for (let slot = this.activeUploads; slot < this.maxConcurrency; slot++) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    // Every cancellation books a pump, including the mass cancellation inside
    // disposeInstance(). Without this guard that pump would pull the next
    // queued item off and start uploading it to the very bucket being torn
    // down - and since the pump is deferred, it lands after disposal rather
    // than during it, so the guard is doing more work than it used to.
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

    this.activeUploads++;
    this.updateItemStatus(id, 'uploading');

    (async () => {
      try {
        const onProgress = (progress: number) => {
          item.progress = progress;
          this.emit('progress', { id, status: item.status, progress });
        };

        // Non-null: the item was just moved to 'uploading', so its resources
        // cannot have been released yet.
        if (item.uploader!['uploadId']) {
          await item.uploader!.resume(item.file!, onProgress);
        } else {
          await item.uploader!.start(item.file!, onProgress);
        }

        if (this.uploads.get(id)?.status === 'uploading') {
          this.updateItemStatus(id, 'completed', 100);
        }
      } catch (err) {
        const currentStatus = this.uploads.get(id)?.status;
        if (currentStatus !== 'paused' && currentStatus !== 'cancelled') {
          console.error(`Upload failed for ${id}:`, err);
          this.updateItemStatus(
            id,
            'failed',
            item.progress,
            err instanceof Error ? err.message : String(err)
          );
        }
      } finally {
        const finalStatus = this.uploads.get(id)?.status;
        if (finalStatus === 'completed' || finalStatus === 'failed') {
          // 'cancelled' is not handled here: cancelUpload() already released
          // this item. 'paused' deliberately keeps its resources so it can
          // resume.
          this.releaseResources(id);
          this.activeUploads--;
          this.processQueue();
        }
      }
    })();
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
