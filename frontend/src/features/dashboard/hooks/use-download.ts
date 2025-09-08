import { useState, useCallback } from 'react';
import { downloadService, type DownloadProgress } from '../services/download-service';
import { useNotification } from '@/context/notification-context';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

export const useDownload = () => {
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(
    new Map()
  );
  const { error: showError, info } = useNotification();

  const updateProgress = useCallback((progress: DownloadProgress) => {
    setDownloadProgress((prev) => new Map(prev.set(progress.fileId, progress)));
  }, []);

  const handleDownloadComplete = useCallback((fileId: string) => {
    setDownloadProgress((prev) => {
      const newMap = new Map(prev);
      const progress = newMap.get(fileId);
      if (progress) {
        newMap.set(fileId, { ...progress, status: 'completed', progress: 100 });
      }
      return newMap;
    });

    setTimeout(() => {
      setDownloadProgress((current) => {
        const updatedMap = new Map(current);
        updatedMap.delete(fileId);
        return updatedMap;
      });
    }, 3000);
  }, []);

  const handleDownloadError = useCallback(
    (fileId: string, error: string) => {
      setDownloadProgress((prev) => {
        const progress = prev.get(fileId);
        if (progress) {
          showError(`Failed to download ${progress.fileName}: ${error}`);
        }
        return prev;
      });
    },
    [showError]
  );

  const downloadFile = useCallback(
    async (file: FileItem) => {
      try {
        await downloadService.downloadFile(file, {
          onProgress: updateProgress,
          onComplete: handleDownloadComplete,
          onError: handleDownloadError,
        });
      } catch (error) {
        console.error('Download failed:', error);
        showError(`Failed to start download for ${file.name}`);
      }
    },
    [updateProgress, handleDownloadComplete, handleDownloadError, showError]
  );

  const downloadFolder = useCallback(
    async (folder: Folder) => {
      try {
        await downloadService.downloadFolder(folder, {
          onProgress: updateProgress,
          onComplete: handleDownloadComplete,
          onError: handleDownloadError,
        });
      } catch (error) {
        console.error('Folder download failed:', error);
        showError(`Failed to start download for ${folder.name}`);
      }
    },
    [updateProgress, handleDownloadComplete, handleDownloadError, showError]
  );

  const cancelDownload = useCallback(
    (fileId: string) => {
      downloadService.cancelDownload(fileId);
      setDownloadProgress((prev) => {
        const newMap = new Map(prev);
        newMap.delete(fileId);
        return newMap;
      });
      info('Download has been cancelled');
    },
    [info]
  );

  const getDownloadProgress = useCallback(
    (fileId: string): DownloadProgress | undefined => {
      return downloadProgress.get(fileId);
    },
    [downloadProgress]
  );

  const isDownloading = useCallback(
    (fileId: string): boolean => {
      const progress = downloadProgress.get(fileId);
      return progress?.status === 'downloading' || progress?.status === 'pending';
    },
    [downloadProgress]
  );

  const getAllDownloads = useCallback((): DownloadProgress[] => {
    return Array.from(downloadProgress.values());
  }, [downloadProgress]);

  return {
    downloadFile,
    downloadFolder,
    cancelDownload,
    getDownloadProgress,
    isDownloading,
    getAllDownloads,
    downloadProgress: Array.from(downloadProgress.values()),
  };
};
