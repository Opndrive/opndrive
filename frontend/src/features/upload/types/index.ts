export type OperationType = 'upload' | 'delete' | 'move' | 'copy';

export interface UploadItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled' | 'paused';
  error?: string;
  file?: File;
  files?: File[];
  destination: string;
  extension?: string;
  uploadedFiles?: number;
  totalFiles?: number;
  operation: OperationType;
  operationLabel?: string;
  isCalculatingSize?: boolean; // For showing loading state while calculating folder size
}

export interface UploadState {
  isOpen: boolean;
  isMinimized: boolean;
  items: UploadItem[];
  totalItems: number;
  completedItems: number;
  isUploading: boolean;
}

export interface UploadProgress {
  itemId: string;
  progress: number;
  uploadedFiles?: number;
  totalFiles?: number;
}

export type UploadMethod = 'auto' | 'signed-url' | 'multipart' | 'multipart-concurrent';

export * from './upload-mode';
