import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { BYOS3ApiProvider } from '@opndrive/s3-api';

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  error?: string;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  onComplete?: (fileId: string) => void;
  onError?: (fileId: string, error: string) => void;
}

class DownloadService {
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  private activeDownloads = new Map<string, AbortController>();

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
        expiryInSeconds: 900,
        isPreview: false,
      });

      if (!downloadUrl) {
        throw new Error('Failed to get download URL');
      }

      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 5,
        status: 'downloading',
      });

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.target = '_blank';
      link.download = file.name;
      link.style.display = 'none';
      document.body.appendChild(link);

      let progress = 10;
      const progressInterval = setInterval(() => {
        if (progress < 90) {
          progress += Math.random() * 10;
          onProgress?.({
            fileId: file.id,
            fileName: file.name,
            progress: Math.min(90, progress),
            status: 'downloading',
          });
        }
      }, 200);

      link.click();

      document.body.removeChild(link);

      setTimeout(() => {
        clearInterval(progressInterval);
        onProgress?.({
          fileId: file.id,
          fileName: file.name,
          progress: 100,
          status: 'completed',
        });
        onComplete?.(file.id);
      }, 1000);
    } catch (error) {
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

export const createDownloadService = (api: BYOS3ApiProvider) => {
  return new DownloadService(api);
};
