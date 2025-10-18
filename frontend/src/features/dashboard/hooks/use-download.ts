import { useState, useCallback } from 'react';
import { createDownloadService, type DownloadProgress } from '../services/download-service';
import { useNotification } from '@/context/notification-context';
import type { FileItem } from '@/features/dashboard/types/file';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export const useDownload = () => {
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(
    new Map()
  );

  const { error: showError, info } = useNotification();
  const { apiS3 } = useAuthGuard();

  if (!apiS3) {
    return {
      downloadFile: async () => {},
      downloadMultipleFiles: async () => {},
      cancelDownload: () => {},
      isDownloading: () => false,
      getAllDownloads: () => [],
      downloadProgress: [],
    };
  }

  const downloadService = createDownloadService(apiS3);

  const updateProgress = useCallback((progress: DownloadProgress) => {
    setDownloadProgress((prev) => new Map(prev.set(progress.fileId, progress)));
  }, []);

  const handleComplete = useCallback((fileId: string) => {
    setDownloadProgress((prev) => {
      const newMap = new Map(prev);
      const progress = newMap.get(fileId);
      if (progress) {
        newMap.set(fileId, { ...progress, status: 'completed', progress: 100 });
      }
      return newMap;
    });

    setTimeout(() => {
      setDownloadProgress((prev) => {
        const newMap = new Map(prev);
        newMap.delete(fileId);
        return newMap;
      });
    }, 3000);
  }, []);

  const handleError = useCallback(
    (fileId: string, error: string) => {
      setDownloadProgress((prev) => {
        const newMap = new Map(prev);
        const progress = newMap.get(fileId);
        if (progress) {
          newMap.set(fileId, { ...progress, status: 'error', error });
          showError(`Failed to download ${progress.fileName}`);
        }
        return newMap;
      });
    },
    [showError]
  );

  const downloadFile = useCallback(
    async (file: FileItem) => {
      try {
        await downloadService.downloadFile(file, {
          onProgress: updateProgress,
          onComplete: handleComplete,
          onError: handleError,
        });
      } catch (error) {
        showError(`Failed to download ${file.name}, ${error}`);
      }
    },
    [updateProgress, handleComplete, handleError, showError]
  );

  const downloadMultipleFiles = useCallback(
    async (files: FileItem[]) => {
      if (files.length === 0) return;

      info(`Downloading ${files.length} file${files.length > 1 ? 's' : ''}...`);

      // Start all downloads immediately
      files.forEach((file) => {
        downloadFile(file);
      });
    },
    [downloadFile, info]
  );

  const cancelDownload = useCallback(
    (fileId: string) => {
      downloadService.cancelDownload(fileId);
      setDownloadProgress((prev) => {
        const newMap = new Map(prev);
        const progress = newMap.get(fileId);
        if (progress) {
          newMap.set(fileId, { ...progress, status: 'cancelled' });
          setTimeout(() => {
            setDownloadProgress((current) => {
              const updated = new Map(current);
              updated.delete(fileId);
              return updated;
            });
          }, 2000);
        }
        return newMap;
      });
      info('Download cancelled');
    },
    [info]
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
    downloadMultipleFiles,
    cancelDownload,
    isDownloading,
    getAllDownloads,
    downloadProgress: Array.from(downloadProgress.values()),
  };
};
