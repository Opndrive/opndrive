import type { UploadQueueManager } from '../services/upload-queue-manager';

interface PendingQueuedUpload {
  itemId: string;
  file: File;
  fileName: string;
}

interface UploaderEntry {
  uploader: import('@opndrive/s3-api').MultipartUploader;
  status: 'uploading' | 'paused' | 'completed' | 'cancelled';
  timestamp: number;
  progress: number;
}

declare global {
  interface Window {
    __upload_queue_manager?: UploadQueueManager;
    __pendingQueuedUpload?: PendingQueuedUpload;
    __upload_store_check?: (itemId: string) => boolean;
    __opndrive_upload_storage?: Map<string, UploaderEntry>;
  }
}

export {};
