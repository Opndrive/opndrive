/**
 * File Preview URL Utilities
 *
 * This module provides utilities for generating and managing file preview URLs.
 * The preview system supports two modes:
 *
 * 1. **Modal Preview** (default): Quick preview overlay within the current page context
 *    - Use: `openPreview()` from FilePreviewContext
 *    - Features: Navigation between files, keyboard shortcuts, stays in context
 *
 * 2. **Route-based Preview** (new tab): Full-page preview with shareable URL
 *    - Use: Functions from this module
 *    - URL format: `/dashboard/preview/{etag}?key={encodedKey}`
 *    - Features: Shareable, bookmarkable, browser back/forward support
 *
 * @module preview-url
 */

interface PreviewUrlParams {
  etag: string;
  key: string;
}

/**
 * Generates a preview URL for opening files in a new tab
 *
 * The URL structure is: `/dashboard/preview/{etag}?key={encodedKey}`
 * - ETag: Unique identifier for the file version (from S3)
 * - Key: S3 object key (full path to the file)
 *
 * @param etag - The ETag of the file (quotes will be automatically cleaned)
 * @param key - The S3 key of the file (will be URL encoded)
 * @returns The complete preview URL path
 *
 * @example
 * ```ts
 * const url = generatePreviewUrl({
 *   etag: '"5d41402abc4b2a76b9719d911017c592"',
 *   key: 'documents/2024/report.pdf'
 * });
 * // Returns: '/dashboard/preview/5d41402abc4b2a76b9719d911017c592?key=documents%2F2024%2Freport.pdf'
 * ```
 */
export function generatePreviewUrl({ etag, key }: PreviewUrlParams): string {
  // Clean ETag if it has quotes
  const cleanETag = etag.replace(/"/g, '');

  // Encode the key to handle special characters
  const encodedKey = encodeURIComponent(key);

  return `/dashboard/preview/${cleanETag}?key=${encodedKey}`;
}

/**
 * Opens a file preview in a new browser tab
 *
 * This is a convenience wrapper around `generatePreviewUrl()` that also
 * opens the URL in a new tab. Commonly used in overflow menus and action buttons.
 *
 * @param etag - The ETag of the file
 * @param key - The S3 key of the file
 *
 * @example
 * ```ts
 * // In a menu action handler
 * const handleOpenInNewTab = () => {
 *   openPreviewInNewTab({
 *     etag: file.ETag,
 *     key: file.Key
 *   });
 * };
 * ```
 */
export function openPreviewInNewTab({ etag, key }: PreviewUrlParams): void {
  const url = generatePreviewUrl({ etag, key });
  window.open(url, '_blank');
}

/**
 * Extracts preview parameters from a preview URL
 *
 * @param url - The preview URL or search params string
 * @returns Object containing etag and key, or null if invalid
 */
export function parsePreviewUrl(url: string): { etag: string; key: string } | null {
  try {
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;

    // Extract etag from path: /dashboard/preview/[etag]
    const match = pathname.match(/\/dashboard\/preview\/([^/]+)/);
    const etag = match?.[1];
    const key = searchParams.get('key');

    if (!etag || !key) {
      return null;
    }

    return {
      etag: decodeURIComponent(etag),
      key: decodeURIComponent(key),
    };
  } catch (error) {
    console.error('Failed to parse preview URL:', error);
    return null;
  }
}
