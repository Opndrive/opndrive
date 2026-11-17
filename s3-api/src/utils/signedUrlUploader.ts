// SignedUrlUploader.ts - Simple signed URL upload with cancel support
import { BYOS3ApiProvider } from '../index.js';

export interface SignedUrlUploadConfig {
  apiProvider: BYOS3ApiProvider;
  key: string;
  fileName: string;
  expiresInSeconds?: number;
  /** Sent as the Content-Type. Defaults to the File's own type. */
  contentType?: string;
  /**
   * How long the request may go without sending a byte before it is given
   * up on. Defaults to a minute.
   */
  stallTimeoutMs?: number;
}

/** See SignedUrlUploadConfig.stallTimeoutMs. */
const DEFAULT_STALL_TIMEOUT_MS = 60_000;

/** Errors shaped so isTransientUploadError can tell a dropped connection from a refusal. */
function networkError() {
  return Object.assign(new Error('Upload failed due to network error'), { name: 'NetworkError' });
}

function httpError(status: number) {
  return Object.assign(new Error(`Upload failed with status ${status}`), {
    name: 'UploadHttpError',
    $metadata: { httpStatusCode: status },
  });
}

function stalledError(timeoutMs: number) {
  return Object.assign(
    new Error(`Upload stalled: nothing was sent for ${Math.round(timeoutMs / 1000)} seconds`),
    { name: 'UploadStalledError' }
  );
}

export class SignedUrlUploader {
  private apiProvider: BYOS3ApiProvider;
  private key: string;
  private fileName: string;
  private expiresInSeconds: number;
  private contentType?: string;
  private stallTimeoutMs: number;
  private abortController: AbortController | null = null;
  private isPaused = false;

  constructor(config: SignedUrlUploadConfig) {
    this.apiProvider = config.apiProvider;
    this.key = config.key;
    this.fileName = config.fileName;
    this.expiresInSeconds = config.expiresInSeconds ?? 3600; // 1 hour default
    this.contentType = config.contentType || undefined;
    this.stallTimeoutMs = config.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  }

  /**
   * Upload a file using a signed URL
   * @param file - The file to upload
   * @param onProgress - Progress callback (progress percentage)
   */
  async upload(file: File, onProgress?: (progress: number) => void): Promise<void> {
    // Generate signed URL
    const signedUrl = await this.apiProvider.uploadWithPreSignedUrl({
      key: this.key,
      expiresInSeconds: this.expiresInSeconds,
    });

    // Create abort controller for cancellation
    this.abortController = new AbortController();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      /**
       * A connection can go quiet without failing: no error, no progress,
       * just a request that never ends. XHR has only a total-time timeout,
       * which any limit would get wrong for a large file on a slow line, so
       * this watches for silence instead and restarts on every progress
       * event. A stalled upload is then an error the manager retries.
       */
      let stalled = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const watch = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          stalled = true;
          xhr.abort();
        }, this.stallTimeoutMs);
      };
      const settle = () => clearTimeout(watchdog);

      // Handle progress
      xhr.upload.addEventListener('progress', (event) => {
        watch();
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        settle();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(httpError(xhr.status));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        settle();
        reject(networkError());
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        settle();
        reject(stalled ? stalledError(this.stallTimeoutMs) : new Error('Upload cancelled'));
      });

      // Listen to abort signal
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      // Open and send request
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader(
        'Content-Type',
        this.contentType || file.type || 'application/octet-stream'
      );
      xhr.send(file);
      watch();
    });
  }

  /**
   * Cancel the upload
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Pause is not supported for signed URL uploads
   * Included for API compatibility
   */
  pause(): void {
    this.isPaused = true;
    // Signed URL uploads cannot be paused - only cancelled
    // This is here for interface compatibility
  }

  /**
   * Check if upload is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }
}
