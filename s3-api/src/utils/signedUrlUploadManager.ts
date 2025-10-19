// SignedUrlUploadManager.ts - Queue manager for signed URL uploads
import { v4 as uuidv4 } from 'uuid';
import { SignedUrlUploader } from './signedUrlUploader.js';
import { BYOS3ApiProvider } from '../index.js';
import { UploadStatus, UploadEvent, EventListener, EventPayload } from '../core/types.js';

interface SignedUrlUploadItem {
  id: string;
  file: File;
  uploader: SignedUrlUploader;
  config: {
    key: string;
    folderId?: string;
  };
  status: UploadStatus;
  progress: number;
  error?: string;
}

export interface SignedUrlUploadManagerConfig {
  apiProvider: BYOS3ApiProvider;
  maxConcurrency?: number;
  expiresInSeconds?: number;
}

export class SignedUrlUploadManager {
  private static instance: SignedUrlUploadManager;
  private apiProvider: BYOS3ApiProvider;
  private uploads = new Map<string, SignedUrlUploadItem>();
  private queue: string[] = [];
  private activeUploads = 0;
  private maxConcurrency: number;
  private expiresInSeconds: number;
  private listeners = new Map<UploadEvent, Set<EventListener>>();

  private constructor(config: SignedUrlUploadManagerConfig) {
    this.apiProvider = config.apiProvider;
    this.maxConcurrency = config.maxConcurrency ?? 2;
    this.expiresInSeconds = config.expiresInSeconds ?? 3600;
  }

  public static getInstance(config: SignedUrlUploadManagerConfig): SignedUrlUploadManager {
    if (!SignedUrlUploadManager.instance) {
      SignedUrlUploadManager.instance = new SignedUrlUploadManager(config);
    }
    return SignedUrlUploadManager.instance;
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
  public addUpload(file: File, config: { key: string }): string {
    const id = uuidv4();
    const uploader = new SignedUrlUploader({
      apiProvider: this.apiProvider,
      key: config.key,
      fileName: file.name,
      expiresInSeconds: this.expiresInSeconds,
    });

    const uploadItem: SignedUrlUploadItem = {
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
   * Add a folder upload (batch of files)
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

  /**
   * Cancel an upload (signed URL uploads cannot be paused, only cancelled)
   */
  public async cancelUpload(id: string): Promise<void> {
    const item = this.uploads.get(id);
    if (!item) return;

    const queueIndex = this.queue.indexOf(id);
    if (queueIndex > -1) {
      this.queue.splice(queueIndex, 1);
    }

    if (item.status === 'uploading') {
      item.uploader.cancel();
      this.activeUploads--;
    }

    this.updateItemStatus(id, 'cancelled');
    this.processQueue();
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

        await item.uploader.upload(item.file, onProgress);

        if (this.uploads.get(id)?.status === 'uploading') {
          this.updateItemStatus(id, 'completed', 100);
        }
      } catch (err) {
        const currentStatus = this.uploads.get(id)?.status;
        if (currentStatus !== 'cancelled') {
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
   * Emit events to listeners
   */
  private emit(event: UploadEvent, payload: EventPayload): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  /**
   * Emit status change event
   */
  private emitStatusChange(id: string, status: UploadStatus, progress: number, error?: string) {
    this.emit('statusChange', { id, status, progress, error });
  }
}
