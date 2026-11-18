// SignedUrlUploadManager.ts - Queue manager for signed URL uploads
import { v4 as uuidv4 } from 'uuid';
import { SignedUrlUploader } from './signedUrlUploader.js';
import { BYOS3ApiProvider } from '../index.js';
import { UploadStatus, UploadEvent, EventListener, EventPayload } from '../core/types.js';
import {
  DEFAULT_RETRY_DELAYS_MS,
  failedOffline,
  isTransientUploadError,
  waitBeforeRetry,
} from './retry.js';
import { folderUploadKey, isDroppedFolderEntry } from './folder-entries.js';

interface SignedUrlUploadItem {
  id: string;
  /**
   * Released once the item is finished, so it stops pinning an OS file
   * handle. See UploadManager.releaseResources for the full reasoning; the
   * item itself is kept so getStatus() can still answer. A failed item keeps
   * its file so retryUpload() can send it again.
   */
  file?: File;
  uploader?: SignedUrlUploader;
  config: {
    key: string;
    folderId?: string;
    contentType?: string;
  };
  status: UploadStatus;
  progress: number;
  error?: string;
}

export interface SignedUrlUploadManagerConfig {
  apiProvider: BYOS3ApiProvider;
  maxConcurrency?: number;
  expiresInSeconds?: number;
  /** See UploadManagerConfig.retryDelaysMs. */
  retryDelaysMs?: readonly number[];
}

/**
 * One worker's run of an upload. See UploadManager's Worker: owning the
 * upload and holding a concurrency slot are kept apart for the same reason.
 */
interface Worker {
  holdsSlot: boolean;
  /** Fired when the upload is taken away, so a wait to retry ends at once. */
  stop: AbortController;
}

export class SignedUrlUploadManager {
  private static instance: SignedUrlUploadManager | undefined;
  private apiProvider: BYOS3ApiProvider;
  private uploads = new Map<string, SignedUrlUploadItem>();
  private queue: string[] = [];
  private activeUploads = 0;
  private maxConcurrency: number;
  private expiresInSeconds: number;
  private retryDelaysMs: readonly number[];
  private listeners = new Map<UploadEvent, Set<EventListener>>();
  // See UploadManager.isDisposed for why this exists.
  private isDisposed = false;
  /**
   * The worker each upload belongs to. See UploadManager.workers.
   *
   * There is no pause here, but the same split matters: 'failed' is emitted
   * while the failed worker is still running, and a listener that retries
   * right then starts a new worker beside it. The failed worker gave its slot
   * back only if the upload was still 'failed', so that slot was lost.
   */
  private workers = new Map<string, Worker>();

  private constructor(config: SignedUrlUploadManagerConfig) {
    this.apiProvider = config.apiProvider;
    this.maxConcurrency = config.maxConcurrency ?? 2;
    this.expiresInSeconds = config.expiresInSeconds ?? 3600;
    this.retryDelaysMs = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  public static getInstance(config: SignedUrlUploadManagerConfig): SignedUrlUploadManager {
    if (!SignedUrlUploadManager.instance) {
      SignedUrlUploadManager.instance = new SignedUrlUploadManager(config);
    }
    return SignedUrlUploadManager.instance;
  }

  /** See UploadManager.disposeInstance - identical contract. */
  public static async disposeInstance(): Promise<void> {
    const existing = SignedUrlUploadManager.instance;
    SignedUrlUploadManager.instance = undefined;
    if (!existing) return;

    existing.isDisposed = true;
    try {
      await existing.cancelAllUploads();
    } catch (err) {
      console.error('Failed to cleanly cancel in-flight signed-url uploads during dispose:', err);
    }
  }

  /** See UploadManager.cancelAllUploads for why this uses allSettled. */
  private async cancelAllUploads(): Promise<void> {
    const ids = Array.from(this.uploads.entries())
      .filter(([, item]) => ['queued', 'uploading'].includes(item.status))
      .map(([id]) => id);

    const results = await Promise.allSettled(ids.map((id) => this.cancelUpload(id)));

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(
          `Failed to cancel signed-url upload ${ids[i]} during dispose:`,
          result.reason
        );
      }
    });
  }

  // Event emitter methods
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
   * Add a file to the upload queue
   */
  public addUpload(file: File, config: { key: string; contentType?: string }): string {
    if (this.isDisposed) {
      throw new Error(
        'This SignedUrlUploadManager instance has been disposed. Obtain a new one via getInstance().'
      );
    }

    const id = uuidv4();

    const uploadItem: SignedUrlUploadItem = {
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
  private uploaderFor(file: File, config: SignedUrlUploadItem['config']): SignedUrlUploader {
    return new SignedUrlUploader({
      apiProvider: this.apiProvider,
      key: config.key,
      fileName: file.name,
      expiresInSeconds: this.expiresInSeconds,
      contentType: config.contentType,
    });
  }

  /** See UploadManager.retryUpload - same contract. */
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
   * Add a folder upload (batch of files)
   */
  public addFolderUpload(
    files: FileList,
    config: { basePrefix?: string }
  ): { folderId: string; fileIds: string[] } {
    const folderId = uuidv4();
    const fileIds: string[] = [];

    for (const file of Array.from(files)) {
      // See folder-entries: only the entry a dropped folder adds is skipped.
      if (isDroppedFolderEntry(file)) continue;

      const fileId = this.addUpload(file, { key: folderUploadKey(file, config.basePrefix) });
      fileIds.push(fileId);
    }

    return { folderId, fileIds };
  }

  /**
   * Cancel an upload (signed URL uploads cannot be paused, only cancelled)
   */
  public async cancelUpload(id: string): Promise<void> {
    const item = this.uploads.get(id);
    if (!item) return;

    // Already terminal - re-running the bookkeeping would emit a duplicate
    // 'cancelled' event. (uploader.cancel() here is synchronous, so unlike
    // UploadManager there is no await window for the worker to race us.)
    if (['completed', 'failed', 'cancelled'].includes(item.status)) return;

    const queueIndex = this.queue.indexOf(id);
    if (queueIndex > -1) {
      this.queue.splice(queueIndex, 1);
    }

    if (item.status === 'uploading') {
      // Non-null: resources are released only on terminal states, and the
      // terminal check above has already returned.
      item.uploader!.cancel();
    }
    // The worker stops on seeing the upload is no longer its own, so its slot
    // is freed here. A queued retry has no worker yet: a failed one still
    // finishing keeps its slot until it is done.
    this.takeFromWorker(id);

    this.updateItemStatus(id, 'cancelled');
    this.releaseResources(id);
    this.processQueue();
  }

  /** See UploadManager.discardUpload. */
  public discardUpload(id: string): boolean {
    const item = this.uploads.get(id);
    if (!item || !['completed', 'failed', 'cancelled'].includes(item.status)) return false;

    this.releaseResources(id);
    return true;
  }

  /** See UploadManager.releaseResources - same leak, same reasoning. */
  private releaseResources(id: string): void {
    const item = this.uploads.get(id);
    if (!item) return;

    item.file = undefined;
    item.uploader = undefined;
  }

  /**
   * Pause is not supported for signed URL uploads
   * Included for API compatibility - will cancel instead
   */
  public pauseUpload(id: string): void {
    const item = this.uploads.get(id);
    if (!item || item.status !== 'uploading') return;

    // Signed URL uploads cannot be paused - cancel instead
    this.cancelUpload(id);
  }

  /**
   * Resume is not supported for signed URL uploads
   * Included for API compatibility
   */
  public async resumeUpload(_id: string): Promise<void> {
    // Signed URL uploads cannot be resumed
    // This is a no-op for compatibility
  }

  /**
   * Get status of an upload
   */
  public getStatus(id: string): { status: UploadStatus; progress: number } | undefined {
    const item = this.uploads.get(id);
    return item ? { status: item.status, progress: item.progress } : undefined;
  }

  /**
   * Get all upload statuses
   */
  public getAllStatuses(): Record<string, { status: UploadStatus; progress: number }> {
    const allStatuses: Record<string, { status: UploadStatus; progress: number }> = {};
    for (const [id, item] of this.uploads.entries()) {
      allStatuses[id] = { status: item.status, progress: item.progress };
    }
    return allStatuses;
  }

  /**
   * Process the upload queue
   */
  private async processQueue(): Promise<void> {
    // See UploadManager.processQueue - without this, cancelling a queued item
    // during dispose would start the next queued item against the old session.
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

        // See UploadManager.processQueue. Each attempt signs a fresh URL, so
        // a retry cannot be refused for an expired one.
        //
        // Unlike there, getting further does not give the retries back. Each
        // attempt here sends the whole file again from its first byte, so
        // nothing an attempt sent is kept for the next, and a connection that
        // always drops part way would otherwise be retried for good.
        let retriesUsed = 0;
        for (;;) {
          try {
            // Non-null: the item is 'uploading'.
            await item.uploader!.upload(item.file!, onProgress);
            break;
          } catch (err) {
            // Cancelled underneath this attempt, which is what ended it.
            if (!ownsUpload()) return;

            // Offline costs no retry. See UploadManager.processQueue.
            const offline = failedOffline(err);
            if (!offline && !this.shouldRetry(id, err, retriesUsed)) throw err;

            const delayMs = offline ? 0 : this.retryDelaysMs[retriesUsed++]!;
            console.warn(
              offline
                ? `Signed-url upload ${id} lost its connection, waiting for the network:`
                : `Signed-url upload ${id} failed, retrying (${retriesUsed} of ${this.retryDelaysMs.length}):`,
              err
            );
            await waitBeforeRetry(delayMs, { signal: worker.stop.signal });

            if (this.isDisposed || !ownsUpload()) return;
          }
        }

        if (ownsUpload() && this.uploads.get(id)?.status === 'uploading') {
          this.updateItemStatus(id, 'completed', 100);
        }
      } catch (err) {
        // Not owned any more means cancelled, which is no failure.
        if (ownsUpload()) {
          console.error(`Upload failed for ${id}:`, err);

          // Let go of the upload before saying it failed, so a retry made in
          // answer gets a worker of its own. See UploadManager.processQueue.
          this.workers.delete(id);
          const uploader = item.uploader;
          this.updateItemStatus(
            id,
            'failed',
            item.progress,
            err instanceof Error ? err.message : String(err)
          );

          // Done with. The file stays, so it can be retried - unless a retry
          // has already given the item an uploader of its own.
          if (item.uploader === uploader) item.uploader = undefined;
        }
      } finally {
        // 'cancelled' is already released by cancelUpload().
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

  /** See UploadManager.takeFromWorker. */
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

  /** See UploadManager.shouldRetry. */
  private shouldRetry(id: string, err: unknown, attempt: number): boolean {
    return (
      attempt < this.retryDelaysMs.length &&
      !this.isDisposed &&
      this.uploads.get(id)?.status === 'uploading' &&
      isTransientUploadError(err)
    );
  }

  /**
   * Update item status and emit events
   */
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
   * Emit events to listeners. See UploadManager.emit - listeners must be
   * isolated from each other.
   */
  private emit(event: UploadEvent, payload: EventPayload): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error(`Signed-url upload event listener for "${event}" threw:`, err);
      }
    });
  }

  /**
   * Emit status change event
   */
  private emitStatusChange(id: string, status: UploadStatus, progress: number, error?: string) {
    this.emit('statusChange', { id, status, progress, error });
  }
}
