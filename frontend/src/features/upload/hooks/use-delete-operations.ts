'use client';

import { useCallback } from 'react';
import { useApiS3 } from '@/hooks/use-auth';
import { useDriveStore } from '@/context/data-context';
import { useUploadStore } from '../stores/use-upload-store';
import { useNotification } from '@/context/notification-context';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

interface FolderContents {
  allKeys: string[];
  totalItems: number;
}

export function useDeleteOperations() {
  const apiS3 = useApiS3();
  const { refreshCurrentData } = useDriveStore();
  const { error: errorFunction } = useNotification();
  const {
    addDeleteOperation,
    updateDeleteProgress,
    setCalculatingSize,
    updateSize,
    completeDeleteOperation,
    failDeleteOperation,
    cancelDeleteOperation,
  } = useUploadStore();

  // Helper function to directly fetch all S3 objects with a prefix using AWS SDK
  const getAllS3ObjectsWithPrefix = useCallback(
    async (folderPrefix: string): Promise<FolderContents> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      const allKeys = await apiS3.listFromPrefix(folderPrefix);

      return {
        allKeys: allKeys,
        totalItems: allKeys.length,
      };
    },
    [apiS3]
  );

  const deleteFileWithProgress = useCallback(
    async (file: FileItem): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      const itemId = `delete-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      addDeleteOperation(itemId, {
        id: itemId,
        name: file.name,
        type: 'file',
        size: file.size?.value || 0,
        status: 'deleting',
        progress: 0,
        operationLabel: 'Deleting file',
        extension: file.extension,
        abortController,
      });

      try {
        updateDeleteProgress(itemId, 0);

        if (abortController.signal.aborted) {
          throw new Error('Operation cancelled');
        }

        // Show intermediate progress
        updateDeleteProgress(itemId, 20);

        // Perform the actual delete
        await apiS3.deleteFile(file.Key || file.name);

        updateDeleteProgress(itemId, 90);

        // Small delay to show progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete "${file.name}": ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      addDeleteOperation,
      updateDeleteProgress,
      completeDeleteOperation,
      failDeleteOperation,
    ]
  );

  const deleteFolderWithProgress = useCallback(
    async (folder: Folder): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      // Create the operation with loading state for size calculation
      const itemId = `delete-folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      addDeleteOperation(itemId, {
        id: itemId,
        name: folder.name,
        type: 'folder',
        size: 0, // Will be updated after we fetch contents
        status: 'deleting',
        progress: 0,
        operationLabel: 'Deleting folder',
        abortController,
      });

      try {
        // Show loading state for size calculation
        setCalculatingSize(itemId, true);
        updateDeleteProgress(itemId, 0);

        if (abortController.signal.aborted) {
          throw new Error('Operation cancelled');
        }

        // Get all folder contents using direct S3 API call
        const folderKey = folder.Prefix || folder.name;
        const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

        const folderContents = await getAllS3ObjectsWithPrefix(normalizedKey);

        // Update operation with actual file count, hide loading state
        setCalculatingSize(itemId, false);
        updateSize(itemId, 0, folderContents.totalItems); // Size calculation not needed for delete
        updateDeleteProgress(itemId, 5); // Small progress after calculation

        if (abortController.signal.aborted) {
          throw new Error('Operation cancelled');
        }

        // Get all keys (files and folders) to delete
        const allKeys = folderContents.allKeys;

        // Add the main folder if it's not already in the list
        if (!allKeys.includes(normalizedKey)) {
          allKeys.push(normalizedKey);
        }

        if (allKeys.length > 0) {
          // Use batch delete for better performance (S3 allows up to 1000 objects per batch)
          const batchSize = 1000;
          let deletedCount = 0;

          for (let i = 0; i < allKeys.length; i += batchSize) {
            if (abortController.signal.aborted) {
              throw new Error('Operation cancelled');
            }

            const batch = allKeys.slice(i, i + batchSize);

            // Use batch delete to delete multiple objects at once
            await apiS3.deleteBatch(batch.map((key) => ({ Key: key })));

            deletedCount += batch.length;
            // Use range 5-95% for actual deletion (more accurate progress)
            const progress = 5 + (deletedCount / allKeys.length) * 90;
            updateDeleteProgress(itemId, progress, deletedCount, allKeys.length);
          }
        } else {
          // Empty folder, just delete the folder itself using single delete
          await apiS3.deleteFile(normalizedKey);
          updateDeleteProgress(itemId, 95);
        }

        // Small delay to show final progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete "${folder.name}": ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      getAllS3ObjectsWithPrefix,
      addDeleteOperation,
      setCalculatingSize,
      updateDeleteProgress,
      updateSize,
      completeDeleteOperation,
      failDeleteOperation,
    ]
  );

  const cancelDelete = useCallback(
    (itemId: string) => {
      cancelDeleteOperation(itemId);
    },
    [cancelDeleteOperation]
  );

  return {
    deleteFileWithProgress,
    deleteFolderWithProgress,
    cancelDelete,
  };
}
