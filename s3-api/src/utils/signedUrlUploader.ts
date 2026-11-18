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
  /**
   * How long to wait for the answer once the whole file has been sent.
   * Defaults to five minutes.
   *
   * Separate from the stall limit because nothing is sent while the server
   * stores the file, so there is no progress to measure silence by. A large
   * file can take a server, or a proxy in front of it, longer than a minute
   * to acknowledge, and giving up then sent a file that may already be
   * stored all over again.
   */
  responseTimeoutMs?: number;
}

/** See SignedUrlUploadConfig.stallTimeoutMs. */
const DEFAULT_STALL_TIMEOUT_MS = 60_000;

/** See SignedUrlUploadConfig.responseTimeoutMs. */
const DEFAULT_RESPONSE_TIMEOUT_MS = 5 * 60_000;

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

/** The same error an abort in flight gives, for one stopped before it began. */
function cancelledError() {
  return new Error('Upload cancelled');
}

/** Same name as a stall, so it is retried the same way. */
function noAnswerError(timeoutMs: number) {
  return Object.assign(
    new Error(
      `Upload stalled: the file was sent, but no answer came back for ${Math.round(timeoutMs / 1000)} seconds`
    ),
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
  private responseTimeoutMs: number;
  private abortController: AbortController | null = null;
  private isPaused = false;
  private isCancelled = false;

  constructor(config: SignedUrlUploadConfig) {
    this.apiProvider = config.apiProvider;
    this.key = config.key;
    this.fileName = config.fileName;
    this.expiresInSeconds = config.expiresInSeconds ?? 3600; // 1 hour default
    this.contentType = config.contentType || undefined;
    this.stallTimeoutMs = config.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    this.responseTimeoutMs = config.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  }

  /**
   * Upload a file using a signed URL
   * @param file - The file to upload
   * @param onProgress - Progress callback (progress percentage)
   */
  async upload(file: File, onProgress?: (progress: number) => void): Promise<void> {
    // The controller comes first, before the URL is signed. Made after, a
    // cancel that landed while signing found nothing to abort - or the last
    // attempt's controller - and the file went up the moment the URL came
    // back, although the upload had been cancelled.
    if (this.isCancelled) throw cancelledError();
    const controller = new AbortController();
    this.abortController = controller;

    const signedUrl = await this.apiProvider.uploadWithPreSignedUrl({
      key: this.key,
      expiresInSeconds: this.expiresInSeconds,
    });

    if (controller.signal.aborted) throw cancelledError();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      /**
       * A connection can go quiet without failing: no error, no progress,
       * just a request that never ends. XHR has only a total-time timeout,
       * which any limit would get wrong for a large file on a slow line, so
       * this watches for silence instead and restarts on every progress
       * event. A stalled upload is then an error the manager retries.
       */
      let stalled: Error | null = null;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      // Once the whole file has been sent, the request is waiting for its
      // answer, and silence is no longer a sign of anything: see
      // responseTimeoutMs.
      let bodySent = false;
      const watch = () => {
        clearTimeout(watchdog);
        const timeoutMs = bodySent ? this.responseTimeoutMs : this.stallTimeoutMs;
        watchdog = setTimeout(() => {
          stalled = bodySent ? noAnswerError(timeoutMs) : stalledError(timeoutMs);
          xhr.abort();
        }, timeoutMs);
      };
      const settle = () => clearTimeout(watchdog);

      // Handle progress
      xhr.upload.addEventListener('progress', (event) => {
        if (bodySent) return;
        watch();
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      // The last byte has gone. From here the server is storing the file.
      xhr.upload.addEventListener('load', () => {
        bodySent = true;
        watch();
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
        reject(stalled ?? cancelledError());
      });

      // Listen to abort signal
      controller.signal.addEventListener('abort', () => {
        xhr.abort();
      });

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
    // For good: an upload asked for after this sends nothing.
    this.isCancelled = true;
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
