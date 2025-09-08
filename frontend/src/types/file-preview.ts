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

// File type detection utilities
export const FILE_TYPE_PATTERNS = {
  image: /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i,
  pdf: /\.pdf$/i,
  document: /\.(txt|md|doc|docx|rtf|odt)$/i,
  code: /\.(js|ts|jsx|tsx|py|java|cpp|c|cs|php|rb|go|rust|html|css|scss|sass|json|xml|yaml|yml)$/i,
  video: /\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv)$/i,
  audio: /\.(mp3|wav|ogg|aac|flac|m4a|wma)$/i,
} as const;

export function getFilePreviewType(fileName: string): FilePreviewType {
  const name = fileName.toLowerCase();

  for (const [type, pattern] of Object.entries(FILE_TYPE_PATTERNS)) {
    if (pattern.test(name)) {
      return type as FilePreviewType;
    }
  }

  return 'unsupported';
}

export function canPreviewFile(file: PreviewableFile, config: PreviewConfig): boolean {
  const fileType = getFilePreviewType(file.name);

  if (fileType === 'unsupported') {
    return false;
  }

  const maxSize = config.maxFileSizes[fileType];
  return file.size <= maxSize;
}
