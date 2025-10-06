import { useState, useCallback } from 'react';
import { createDeleteService } from '@/features/dashboard/services/delete-service';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { useNotification } from '@/context/notification-context';
import { useDriveStore } from '@/context/data-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export interface UseDeleteReturn {
  deleteFile: (file: FileItem) => Promise<void>;
  deleteFolder: (folder: Folder) => Promise<void>;
  isDeleting: (itemId: string) => boolean;
  getActiveDeletes: () => string[];
}

export const useDelete = (): UseDeleteReturn => {
  const [activeDeletes, setActiveDeletes] = useState<Set<string>>(new Set());
  const { success, error } = useNotification();
  const { refreshCurrentData } = useDriveStore();
  const { apiS3 } = useAuthGuard();

  if (!apiS3) {
    return {
      deleteFile: async () => {},
      deleteFolder: async () => {},
      isDeleting: () => false,
      getActiveDeletes: () => [],
    };
  }

  const deleteService = createDeleteService(apiS3);
  const deleteFile = useCallback(
    async (file: FileItem) => {
      const fileId = file.id || file.Key || file.name;

      setActiveDeletes((prev) => new Set(prev).add(fileId));

      try {
        await deleteService.deleteFile(file, {
          onComplete: () => {
            // Refresh data to reflect the deletion
            refreshCurrentData().catch(() => {
              // Don't fail the delete if refresh fails
            });
          },
          onError: (errorMessage) => {
            error(`Failed to delete "${file.name}": ${errorMessage}`);
          },
        });
      } catch (err) {
        console.error('Delete file error:', err);
        error(`Failed to delete "${file.name}"`);
      } finally {
        setActiveDeletes((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
      }
    },
    [success, error, refreshCurrentData]
  );

  const deleteFolder = useCallback(
    async (folder: Folder) => {
      const folderId = folder.id || folder.Prefix || folder.name;

      setActiveDeletes((prev) => new Set(prev).add(folderId));

      try {
        await deleteService.deleteFolder(folder, {
          onComplete: () => {
            // Refresh data to reflect the deletion
            refreshCurrentData().catch(() => {
              // Don't fail the delete if refresh fails
            });
          },
          onError: (errorMessage) => {
            error(`Failed to delete "${folder.name}": ${errorMessage}`);
          },
        });
      } catch (err) {
        console.error('Delete folder error:', err);
        error(`Failed to delete "${folder.name}"`);
      } finally {
        setActiveDeletes((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    },
    [success, error, refreshCurrentData]
  );

  const isDeleting = useCallback(
    (itemId: string) => {
      return activeDeletes.has(itemId);
    },
    [activeDeletes]
  );

  const getActiveDeletes = useCallback(() => {
    return Array.from(activeDeletes);
  }, [activeDeletes]);

  return {
    deleteFile,
    deleteFolder,
    isDeleting,
    getActiveDeletes,
  };
};
