'use client';

import { useCallback, useEffect } from 'react';
import { operationsManager } from '../services/operations-manager';
import { useApiS3 } from '@/hooks/use-auth';
import { useDriveStore } from '@/context/data-context';
import { useUploadStore } from './use-upload-store';
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
  const { success, error: errorFunction } = useNotification();
  const { registerCancelFunction } = useUploadStore();

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

      const itemId = operationsManager.startOperation({
        name: file.name,
        type: 'file',
        size: file.size?.value || 0,
        operation: 'delete',
        operationLabel: 'Deleting file',
        extension: file.extension,
      });

      try {
        operationsManager.updateStatus(itemId, 'uploading');
        operationsManager.updateProgress({ itemId, progress: 0 }); // Start from 0%

        const signal = operationsManager.getAbortSignal(itemId);
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        // Show intermediate progress
        operationsManager.updateProgress({ itemId, progress: 20 });

        // Perform the actual delete
        await apiS3.deleteFile(file.Key || file.name);

        operationsManager.updateProgress({ itemId, progress: 90 });

        // Small delay to show progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        operationsManager.updateProgress({ itemId, progress: 100 });
        operationsManager.completeOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Delete failed';
        operationsManager.failOperation(itemId, errorMessage);
        errorFunction(`Failed to delete "${file.name}": ${errorMessage}`);
        throw error;
      }
    },
    [apiS3, refreshCurrentData, success, errorFunction]
  );

  const deleteFolderWithProgress = useCallback(
    async (folder: Folder): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      // Create the operation with loading state for size calculation
      const itemId = operationsManager.startOperation({
        name: folder.name,
        type: 'folder',
        size: 0, // Will be updated after we fetch contents
        operation: 'delete',
        operationLabel: 'Deleting folder',
      });

      try {
        // Show loading state for size calculation
        operationsManager.setCalculatingSize(itemId, true);
        operationsManager.updateStatus(itemId, 'uploading');
        operationsManager.updateProgress({ itemId, progress: 0 }); // Start from 0%

        const signal = operationsManager.getAbortSignal(itemId);
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        // Get all folder contents using direct S3 API call
        const folderKey = folder.Prefix || folder.name;
        const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

        const folderContents = await getAllS3ObjectsWithPrefix(normalizedKey);

        // Update operation with actual file count, hide loading state
        operationsManager.setCalculatingSize(itemId, false);
        operationsManager.updateSize(
          itemId,
          0, // Size calculation not needed for delete
          folderContents.totalItems
        );
        operationsManager.updateProgress({ itemId, progress: 5 }); // Small progress after calculation

        if (signal?.aborted) {
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
            if (signal?.aborted) {
              throw new Error('Operation cancelled');
            }

            const batch = allKeys.slice(i, i + batchSize);

            // Use batch delete to delete multiple objects at once
            await apiS3.deleteBatch(batch.map((key) => ({ Key: key })));

            deletedCount += batch.length;
            // Use range 5-95% for actual deletion (more accurate progress)
            const progress = 5 + (deletedCount / allKeys.length) * 90;
            operationsManager.updateProgress({
              itemId,
              progress,
              completedFiles: deletedCount,
              totalFiles: allKeys.length,
            });
          }
        } else {
          // Empty folder, just delete the folder itself using single delete
          await apiS3.deleteFile(normalizedKey);
          operationsManager.updateProgress({ itemId, progress: 95 });
        }

        // Small delay to show final progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        operationsManager.updateProgress({ itemId, progress: 100 });
        operationsManager.completeOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Delete failed';
        operationsManager.failOperation(itemId, errorMessage);
        errorFunction(`Failed to delete "${folder.name}": ${errorMessage}`);
        throw error;
      }
    },
    [apiS3, refreshCurrentData, errorFunction, getAllS3ObjectsWithPrefix]
  );

  const cancelDelete = useCallback((itemId: string) => {
    operationsManager.cancelOperation(itemId);
  }, []);

  // Register the cancel function for delete operations
  useEffect(() => {
    const handleCancel = async (itemId: string): Promise<void> => {
      // Check if this is a delete operation by looking at active operations
      if (operationsManager.isOperationActive(itemId)) {
        operationsManager.cancelOperation(itemId);
      }
    };

    registerCancelFunction(handleCancel);
  }, [registerCancelFunction]);

  return {
    deleteFileWithProgress,
    deleteFolderWithProgress,
    cancelDelete,
  };
}
