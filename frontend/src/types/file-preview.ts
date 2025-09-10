export interface PreviewableFile {
  id: string;
  name: string;
  key?: string; // Make optional since S3 objects use 'Key'
  Key?: string; // Add S3 format
  size: number;
  type?: string;
  lastModified?: Date;
  // Support S3 object format
  Size?: number;
  LastModified?: string;
  ETag?: string;
  StorageClass?: string;
  extension?: string;
}

export type FilePreviewType =
  | 'image'
  | 'pdf'
  | 'document'
  | 'code'
  | 'video'
  | 'audio'
  | 'unsupported';

export interface FilePreviewState {
  isOpen: boolean;
  file: PreviewableFile | null;
  files: PreviewableFile[];
  currentIndex: number;
  loading: boolean;
  error: string | null;
}

export interface FilePreviewActions {
  openPreview: (file: PreviewableFile, files?: PreviewableFile[]) => void;
  closePreview: () => void;
  navigateToFile: (index: number) => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
}

export interface PreviewConfig {
  maxFileSizes: {
    image: number; // 30MB
    pdf: number; // 25MB
    document: number; // 10MB
    code: number; // 5MB
    video: number; // 100MB
    audio: number; // 50MB
  };
}

import { getFileCategory } from '@/config/file-extensions';

// File type detection utilities - now using centralized config
export function getFilePreviewType(fileName: string): FilePreviewType {
  const category = getFileCategory(fileName);

  // Map centralized categories to preview types
  switch (category) {
    case 'image':
      return 'image';
    case 'document':
      if (fileName.toLowerCase().endsWith('.pdf')) {
        return 'pdf';
      }
      return 'document';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'code':
      return 'code';
    default:
      return 'document'; // fallback
  }
}

export function canPreviewFile(file: PreviewableFile, config: PreviewConfig): boolean {
  const fileType = getFilePreviewType(file.name);

  if (fileType === 'unsupported') {
    return false;
  }

  const maxSize = config.maxFileSizes[fileType];
  return file.size <= maxSize;
}
