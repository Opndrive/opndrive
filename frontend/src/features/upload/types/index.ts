export interface UploadItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled' | 'paused';
  error?: string;
  file?: File;
  files?: File[]; // For folder uploads
  destination: string;
  extension?: string;
  uploadedFiles?: number; // For folders: how many files completed
  totalFiles?: number; // For folders: total files to upload
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
