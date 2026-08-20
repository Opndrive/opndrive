/**
 * File Preview URL Utilities
 *
 * There is one preview now, and one URL scheme for it: the `preview` query
 * parameter carrying an S3 key, read by `FilePreviewProvider`.
 *
 * It used to be two. A modal that put nothing in the address bar, and a
 * separate page at `/dashboard/preview/{etag}?key=` for opening in a new tab.
 * Two preview modes that did not share a URL scheme was the underlying
 * confusion behind #155, so the page is now only a redirect into the modal.
 *
 * The key identifies the file, not the ETag. An ETag is a version, so a link
 * shared before the file was re-uploaded would stop resolving.
 *
 * @module preview-url
 */

import { PREVIEW_PARAM } from '@/context/file-preview-context';

interface PreviewUrlParams {
  key: string;
}

/**
 * Builds a link that opens a file's preview.
 *
 * Points at the browse route rather than the caller's current one, because
 * this is for links leaving the current page - a new tab has no context to
 * preserve. Closing the preview then leaves the user in the file browser.
 *
 * @param key - The S3 key of the file
 *
 * @example
 * ```ts
 * generatePreviewUrl({ key: 'documents/2024/report.pdf' });
 * // '/dashboard/browse?preview=documents%2F2024%2Freport.pdf'
 * ```
 */
export function generatePreviewUrl({ key }: PreviewUrlParams): string {
  return `/dashboard/browse?${PREVIEW_PARAM}=${encodeURIComponent(key)}`;
}

/**
 * Opens a file preview in a new browser tab.
 *
 * @param key - The S3 key of the file
 */
export function openPreviewInNewTab({ key }: PreviewUrlParams): void {
  window.open(generatePreviewUrl({ key }), '_blank');
}
