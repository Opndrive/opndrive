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
  private static instance: UploadManager;
  private s3: S3Client;
  private prefix: string = ''; // Base prefix from config
  private bucket: string = ''; // Bucket from config
  private uploads = new Map<string, UploadItem>();
  private queue: string[] = [];
  private activeUploads = 0;
  private maxConcurrency: number; // Max files to upload at once
  private partSize: number;

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
    const id = uuidv4();
    const uploader = new MultipartUploader({
      s3: this.s3,
      bucket: this.bucket,
      key: config.key,
      fileName: file.name,
      partSizeMB: this.partSize,
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
  public pauseUpload(id: string): void {
    const item = this.uploads.get(id);
    if (!item || item.status !== 'uploading') return;

    item.uploader.pause();
    this.activeUploads--;
    this.updateItemStatus(id, 'paused');
    this.processQueue();
  }

  public async resumeUpload(id: string): Promise<void> {
    const item = this.uploads.get(id);
    if (!item || item.status !== 'paused') return;

    this.updateItemStatus(id, 'queued');
    this.queue.unshift(id);
    this.processQueue();
  }

  public async cancelUpload(id: string): Promise<void> {
    const item = this.uploads.get(id);
    if (!item) return;

    const queueIndex = this.queue.indexOf(id);
    if (queueIndex > -1) {
      this.queue.splice(queueIndex, 1);
    }

    if (item.status === 'uploading' || item.status === 'paused') {
      await item.uploader.cancel();
      if (item.status === 'uploading') {
        this.activeUploads--;
      }
    }

    this.updateItemStatus(id, 'cancelled');
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

        if (item.uploader['uploadId']) {
          await item.uploader.resume(item.file, onProgress);
        } else {
          await item.uploader.start(item.file, onProgress);
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

  private emit(event: UploadEvent, payload: EventPayload): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  private emitStatusChange(id: string, status: UploadStatus, progress: number, error?: string) {
    this.emit('statusChange', { id, status, progress, error });
  }
}
