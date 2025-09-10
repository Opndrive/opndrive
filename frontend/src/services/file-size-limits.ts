/**
 * File size limits for preview functionality
 * Based on industry standards from Google Drive, Dropbox, OneDrive
 */

export interface FileSizeLimits {
  // Image files (MB)
  image: number;
  // Video files (MB)
  video: number;
  // PDF files (MB)
  pdf: number;
  // Spreadsheet files (MB)
  spreadsheet: number;
  // Code/Text files (MB)
  code: number;
  // Audio files (MB)
  audio: number;
  // Document files (MB)
  document: number;
}

// Conservative file size limits based on major cloud providers
export const FILE_SIZE_LIMITS: FileSizeLimits = {
  image: 25, // 25MB - limit for image preview
  video: 100, // 100MB - Large enough for most preview needs
  pdf: 25, // 25MB - limit for PDF preview
  spreadsheet: 10, // 10MB - Excel files can be complex
  code: 1, // 1MB - Code files should be small for good UX
  document: 10, // 10MB - Word docs, text files
  audio: 50, // 50MB - Audio files for preview
};

export const FILE_EXTENSION_TO_TYPE: Record<string, keyof FileSizeLimits> = {
  // Images
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.svg': 'image',
  '.ico': 'image',
  '.tiff': 'image',
  '.tif': 'image',

  // Videos
  '.mp4': 'video',
  '.webm': 'video',
  '.ogv': 'video', // Video ogg format
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.wmv': 'video',
  '.m4v': 'video',
  '.flv': 'video',
  '.3gp': 'video',

  // PDFs
  '.pdf': 'pdf',

  // Spreadsheets
  '.csv': 'spreadsheet',
  '.xls': 'spreadsheet',
  '.xlsx': 'spreadsheet',
  '.xlsm': 'spreadsheet',
  '.xlsb': 'spreadsheet',
  '.ods': 'spreadsheet',
  '.tsv': 'spreadsheet',

  // Code files
  '.js': 'code',
  '.ts': 'code',
  '.jsx': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.java': 'code',
  '.cpp': 'code',
  '.c': 'code',
  '.cs': 'code',
  '.php': 'code',
  '.rb': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.html': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.sass': 'code',
  '.less': 'code',
  '.json': 'code',
  '.xml': 'code',
  '.yaml': 'code',
  '.yml': 'code',
  '.md': 'code',
  '.txt': 'code',
  '.log': 'code',
  '.sql': 'code',
  '.sh': 'code',
  '.bat': 'code',
  '.ps1': 'code',

  // Audio
  '.mp3': 'audio',
  '.wav': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.ogg': 'audio',
  '.wma': 'audio',
  '.m4a': 'audio',

  // Documents
  '.doc': 'document',
  '.docx': 'document',
  '.rtf': 'document',
  '.odt': 'document',
  '.pages': 'document',
};

export function getFileExtension(filename: string): string {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'));
}

export function getFileType(filename: string): keyof FileSizeLimits | null {
  const extension = getFileExtension(filename);
  return FILE_EXTENSION_TO_TYPE[extension] || null;
}

export function getFileSizeLimit(filename: string): number | null {
  const fileType = getFileType(filename);
  return fileType ? FILE_SIZE_LIMITS[fileType] : null;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function isFileSizeAllowedForPreview(
  filename: string,
  fileSizeBytes: number
): {
  allowed: boolean;
  reason?: string;
  limit?: string;
  currentSize?: string;
} {
  const fileType = getFileType(filename);

  if (!fileType) {
    return {
      allowed: false,
      reason: 'File type not supported for preview',
    };
  }

  const limitMB = FILE_SIZE_LIMITS[fileType];
  const limitBytes = limitMB * 1024 * 1024;

  if (fileSizeBytes > limitBytes) {
    return {
      allowed: false,
      reason: `File size exceeds the preview limit for ${fileType} files`,
      limit: formatFileSize(limitBytes),
      currentSize: formatFileSize(fileSizeBytes),
    };
  }

  return { allowed: true };
}

export interface PreviewSizeCheckResult {
  canPreview: boolean;
  error?: {
    title: string;
    message: string;
    suggestion: string;
  };
}

export function checkPreviewEligibility(
  filename: string,
  fileSizeBytes: number
): PreviewSizeCheckResult {
  const sizeCheck = isFileSizeAllowedForPreview(filename, fileSizeBytes);

  if (!sizeCheck.allowed) {
    const fileType = getFileType(filename);
    const typeDisplayName = fileType
      ? fileType.charAt(0).toUpperCase() + fileType.slice(1)
      : 'File';

    return {
      canPreview: false,
      error: {
        title: `${typeDisplayName} Too Large for Preview`,
        message: sizeCheck.reason || 'File cannot be previewed',
        suggestion: sizeCheck.limit
          ? `Maximum size for ${fileType} preview: ${sizeCheck.limit}. Current size: ${sizeCheck.currentSize}. Please download to view.`
          : 'Please download the file to view its contents.',
      },
    };
  }

  return { canPreview: true };
}
