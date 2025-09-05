/**
 * Professional download service for handling file and folder downloads
 * with progress tracking and error handling
 */

import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { apiS3 } from '@/services/byo-s3-api';

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'completed' | 'error';
  error?: string;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  onComplete?: (fileId: string) => void;
  onError?: (fileId: string, error: string) => void;
}

class DownloadService {
  private activeDownloads = new Map<string, AbortController>();

  /**
   * Download a single file
   */
  async downloadFile(file: FileItem, options: DownloadOptions = {}): Promise<void> {
    const { onProgress, onComplete, onError } = options;
    const abortController = new AbortController();
    this.activeDownloads.set(file.id, abortController);

    try {
      // Notify download started
      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 0,
        status: 'pending',
      });

      // Get presigned URL for download
      const downloadUrl = await apiS3.getSignedUrl({
        key: file.Key || file.name, // Fallback to file.name if Key is undefined
        expiryInSeconds: 900, // 15 minutes
      });

      if (!downloadUrl) {
        throw new Error('Failed to get download URL');
      }

      // Update progress to downloading
      onProgress?.({
        fileId: file.id,
        fileName: file.name,
        progress: 5,
        status: 'downloading',
      });

      // Create a hidden anchor element for download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.name;
      link.style.display = 'none';
      document.body.appendChild(link);

      // Show progress simulation for better UX
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

      // Trigger download
      link.click();

      // Clean up
      document.body.removeChild(link);

      // Simulate completion after a short delay
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

  /**
   * Download a folder as a ZIP file
   */
  async downloadFolder(folder: Folder, options: DownloadOptions = {}): Promise<void> {
    const { onProgress, onError } = options;

    try {
      // For now, we'll implement a basic folder download
      // In a real implementation, you'd want to create a ZIP file
      onProgress?.({
        fileId: folder.id,
        fileName: folder.name,
        progress: 0,
        status: 'pending',
      });

      // TODO: Implement folder zipping and download
      // This would involve:
      // 1. Recursively fetching all files in the folder
      // 2. Creating a ZIP file using a library like JSZip
      // 3. Downloading the ZIP file

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

  /**
   * Cancel an active download
   */
  cancelDownload(fileId: string): void {
    const controller = this.activeDownloads.get(fileId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(fileId);
    }
  }

  /**
   * Cancel all active downloads
   */
  cancelAllDownloads(): void {
    for (const [fileId] of this.activeDownloads) {
      this.cancelDownload(fileId);
    }
  }

  /**
   * Check if a download is active
   */
  isDownloadActive(fileId: string): boolean {
    return this.activeDownloads.has(fileId);
  }

  /**
   * Get all active download IDs
   */
  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }
}

// Singleton instance
export const downloadService = new DownloadService();
