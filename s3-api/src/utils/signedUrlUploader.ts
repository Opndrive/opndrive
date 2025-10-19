// SignedUrlUploader.ts - Simple signed URL upload with cancel support
import { BYOS3ApiProvider } from '../index.js';

export interface SignedUrlUploadConfig {
  apiProvider: BYOS3ApiProvider;
  key: string;
  fileName: string;
  expiresInSeconds?: number;
}

export class SignedUrlUploader {
  private apiProvider: BYOS3ApiProvider;
  private key: string;
  private fileName: string;
  private expiresInSeconds: number;
  private abortController: AbortController | null = null;
  private isPaused = false;

  constructor(config: SignedUrlUploadConfig) {
    this.apiProvider = config.apiProvider;
    this.key = config.key;
    this.fileName = config.fileName;
    this.expiresInSeconds = config.expiresInSeconds ?? 3600; // 1 hour default
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

      // Handle progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed due to network error'));
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Listen to abort signal
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      // Open and send request
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
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
