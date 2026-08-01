import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { BYOS3ApiProvider } from '@opndrive/s3-api';

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'queued' | 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  queuePosition?: number;
  /** Bytes received so far. Absent until the first chunk arrives. */
  loadedBytes?: number;
  /** Total bytes expected, or 0 when the server sends no Content-Length. */
  totalBytes?: number;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  onComplete?: (fileId: string) => void;
  onError?: (fileId: string, error: string) => void;
}

const SIGNED_URL_EXPIRY_SECONDS = 900;

/**
 * Streaming a download means holding the whole file in tab memory before it is
 * handed to disk. Past this size we give up progress reporting and let the
 * browser's own download manager take the transfer instead of risking an OOM.
 */
const STREAM_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Streaming progress is capped just below completion so that 100% is only ever
 * shown once the blob has actually been handed to the browser.
 */
const MAX_STREAMING_PROGRESS = 99;

/**
 * Give the browser time to start reading the blob before the URL is revoked.
 * The download begins synchronously on click, so this only needs to outlast
 * that hand-off - holding longer just pins the whole file in memory.
 */
const OBJECT_URL_REVOKE_DELAY_MS = 10_000;

/**
 * Matches on `name` rather than `instanceof Error`: the DOM spec only promises
 * an object whose `name` is 'AbortError', and DOMException does not extend
 * Error in every runtime. Getting this wrong reports a user's cancel as a
 * failed download.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

/**
 * Clicks a synthetic anchor. Used both for blob downloads and for the
 * large-file hand-off to the browser's download manager.
 *
 * `download` is only set for blob URLs: they are same-origin, so the attribute
 * is honoured. On a cross-origin presigned URL the attribute is ignored and the
 * filename comes from the `Content-Disposition` header instead.
 */
function clickDownloadLink(url: string, fileName?: string): void {
  const link = document.createElement('a');
  link.href = url;
  if (fileName) link.download = fileName;
  // Deliberately no target="_blank" - it suppresses the download attribute.
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

class DownloadService {
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  private activeDownloads = new Map<string, AbortController>();

  /**
   * Drains the response body, reporting real byte progress as chunks arrive.
   *
   * The reader is tied to the same `AbortSignal` passed to `fetch`, so
   * cancelling tears down the live connection rather than merely hiding the UI.
   */
  private async collectWithProgress(
    response: Response,
    file: FileItem,
    onProgress: DownloadOptions['onProgress']
  ): Promise<Blob> {
    const headerLength = Number(response.headers.get('Content-Length'));
    const total = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : 0;

    // A body-less response (or a runtime without streams) still yields a
    // correct file - only the progress detail is lost.
    if (!response.body) return response.blob();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let lastPercent = -1;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        chunks.push(value);
        loaded += value.byteLength;

        // Without Content-Length there is no honest percentage to report, so
        // hold at the starting value and let the byte counters carry the detail.
        const rawPercent = total ? (loaded / total) * 100 : 0;

        // Emit only when the whole percent advances. A 1 GB body arrives in
        // tens of thousands of chunks, and every update re-renders each
        // progress subscriber - roughly one update per percent is plenty.
        // Unknown-length responses (which S3 does not produce) fall back to
        // per-chunk emission since there is no percentage to debounce on.
        //
        // Throttling on the uncapped percent matters: capping first would pin
        // the last ~1% of chunks to the same bucket and freeze the byte
        // counter short of the true total.
        const wholePercent = Math.floor(rawPercent);
        if (total === 0 || wholePercent > lastPercent) {
          lastPercent = wholePercent;
          onProgress?.({
            fileId: file.id,
            fileName: file.name,
            progress: Math.min(MAX_STREAMING_PROGRESS, rawPercent),
            status: 'downloading',
            loadedBytes: loaded,
            totalBytes: total,
          });
        }
      }
    } finally {
      // Release the lock even when the read rejects, so an aborted stream is
      // not left holding a reader.
      reader.releaseLock();
    }

    const contentType = response.headers.get('Content-Type');
    return new Blob(chunks as BlobPart[], contentType ? { type: contentType } : undefined);
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob);
    try {
      clickDownloadLink(objectUrl, fileName);
    } finally {
      // Revoking synchronously can cancel the download in some browsers before
      // it has read the blob, so release on a timer instead.
      setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
    }
  }

  async downloadFile(file: FileItem, options: DownloadOptions = {}): Promise<void> {
    const { onProgress, onComplete, onError } = options;
    const abortController = new AbortController();
    this.activeDownloads.set(file.id, abortController);

    try {
      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 0,
        status: 'pending',
      });

      const downloadUrl = await this.api.getSignedUrl({
        key: file.Key || file.name,
        expiryInSeconds: SIGNED_URL_EXPIRY_SECONDS,
        isPreview: false,
        // Cross-origin presigned URLs ignore <a download>, so the filename has
        // to travel with the response itself.
        downloadFilename: file.name,
      });

      if (!downloadUrl) {
        throw new Error('Failed to get download URL');
      }

      // Signing is not abortable, so a cancel during it only lands here. Both
      // paths below are side-effecting, and the large-file one cannot be undone
      // once the browser has the URL.
      if (abortController.signal.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }

      const knownSize = typeof file.Size === 'number' ? file.Size : 0;

      if (knownSize > STREAM_MAX_BYTES) {
        // Handed to the browser: it downloads straight to disk under the name
        // from Content-Disposition, but we can no longer observe or cancel it.
        clickDownloadLink(downloadUrl);
        onProgress?.({
          fileId: file.id,
          fileName: file.name,
          progress: 100,
          status: 'completed',
          totalBytes: knownSize,
        });
        onComplete?.(file.id);
        return;
      }

      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 0,
        status: 'downloading',
        loadedBytes: 0,
        totalBytes: knownSize,
      });

      const response = await fetch(downloadUrl, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await this.collectWithProgress(response, file, onProgress);

      // Cancelling between the final chunk and the save would otherwise still
      // drop a file on the user's disk.
      if (abortController.signal.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }

      this.saveBlob(blob, file.name);

      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 100,
        status: 'completed',
        loadedBytes: blob.size,
        totalBytes: blob.size,
      });
      onComplete?.(file.id);
    } catch (error) {
      // A cancel is a user action, not a failure - it must not raise an error toast.
      if (isAbortError(error)) {
        onProgress?.({
          fileId: file.id,
          fileName: file.name,
          progress: 0,
          status: 'cancelled',
        });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Download failed';

      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 0,
        status: 'error',
        error: errorMessage,
      });

      onError?.(file.id, errorMessage);
    } finally {
      this.activeDownloads.delete(file.id);
    }
  }

  async downloadFolder(folder: Folder, options: DownloadOptions = {}): Promise<void> {
    const { onProgress, onError } = options;

    try {
      onProgress?.({
        fileId: folder.id,
        fileName: folder.name,
        progress: 0,
        status: 'pending',
      });

      throw new Error('Folder download not yet implemented');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Folder download failed';

      onProgress?.({
        fileId: folder.id,
        fileName: folder.name,
        progress: 0,
        status: 'error',
        error: errorMessage,
      });

      onError?.(folder.id, errorMessage);
    }
  }

  cancelDownload(fileId: string): void {
    const controller = this.activeDownloads.get(fileId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(fileId);
    }
  }

  cancelAllDownloads(): void {
    for (const [fileId] of this.activeDownloads) {
      this.cancelDownload(fileId);
    }
  }

  isDownloadActive(fileId: string): boolean {
    return this.activeDownloads.has(fileId);
  }

  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }
}

export type { DownloadService };

export const createDownloadService = (api: BYOS3ApiProvider) => {
  return new DownloadService(api);
};
