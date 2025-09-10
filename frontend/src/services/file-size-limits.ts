import {
  getFileCategory,
  getPreviewSizeLimit,
  isFilePreviewable,
  FileCategory,
} from '@/config/file-extensions';

export interface PreviewEligibilityResult {
  canPreview: boolean;
  reason?: string;
  sizeLimit: number;
  actualSize: number;
}

/**
 * Check if a file is eligible for preview based on its extension and size
 */
export function checkPreviewEligibility(
  filename: string,
  fileSizeInBytes: number
): PreviewEligibilityResult {
  const category = getFileCategory(filename);
  const sizeLimit = getPreviewSizeLimit(filename);

  // File type not supported
  if (!category || !isFilePreviewable(filename)) {
    return {
      canPreview: false,
      reason: 'File type not supported for preview',
      sizeLimit: 0,
      actualSize: fileSizeInBytes,
    };
  }

  // No size limit means no preview allowed
  if (sizeLimit === 0) {
    return {
      canPreview: false,
      reason: 'File type not previewable',
      sizeLimit: 0,
      actualSize: fileSizeInBytes,
    };
  }

  // File too large
  if (fileSizeInBytes > sizeLimit) {
    return {
      canPreview: false,
      reason: `File size exceeds ${Math.round(sizeLimit / 1024 / 1024)}MB limit`,
      sizeLimit,
      actualSize: fileSizeInBytes,
    };
  }

  // All checks passed
  return {
    canPreview: true,
    sizeLimit,
    actualSize: fileSizeInBytes,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(sizeInBytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = sizeInBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Get file size limit for a specific category
 */
export function getSizeLimitForCategory(category: FileCategory): number {
  return getPreviewSizeLimit(`.${category}`);
}

/**
 * Legacy function for backward compatibility
 */
export function isFileSizeAllowedForPreview(
  filename: string,
  fileSizeBytes: number
): {
  allowed: boolean;
  reason?: string;
  limit?: string;
  currentSize?: string;
} {
  const result = checkPreviewEligibility(filename, fileSizeBytes);

  return {
    allowed: result.canPreview,
    reason: result.reason,
    limit: result.sizeLimit > 0 ? formatFileSize(result.sizeLimit) : undefined,
    currentSize: formatFileSize(result.actualSize),
  };
}

/**
 * Legacy interface for backward compatibility
 */
export interface PreviewSizeCheckResult {
  canPreview: boolean;
  error?: {
    title: string;
    message: string;
    suggestion: string;
  };
}

// Re-export for backward compatibility
export { getFileExtension, getFileCategory, isFilePreviewable } from '@/config/file-extensions';
