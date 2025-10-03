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
  files: string[];
  folders: string[];
  totalSize: number;
  totalItems: number;
}

export function useDeleteOperations() {
  const apiS3 = useApiS3();
  const { refreshCurrentData } = useDriveStore();
  const { success, error: errorFunction } = useNotification();
  const { registerCancelFunction } = useUploadStore();

  // Helper function to recursively fetch all folder contents
  const getAllFolderContents = useCallback(
    async (folderPrefix: string): Promise<FolderContents> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      const allFiles: string[] = [];
      const allFolders: string[] = [];
      let totalSize = 0;
      let nextToken: string | undefined;

      const fetchBatch = async (token?: string) => {
        const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1000, token);

        // Add files from this batch
        result.files.forEach((file) => {
          if (file.Key) {
            allFiles.push(file.Key);
            totalSize += file.Size || 0;
          }
        });

        // Add folders from this batch and recursively fetch their contents
        for (const folder of result.folders) {
          if (folder.Prefix) {
            allFolders.push(folder.Prefix);
            // Recursively get contents of subfolders
            const subContents = await getAllFolderContents(folder.Prefix);
            allFiles.push(...subContents.files);
            allFolders.push(...subContents.folders);
            totalSize += subContents.totalSize;
          }
        }

        return result.nextToken;
      };

      // Keep fetching until we have all contents
      do {
        nextToken = await fetchBatch(nextToken);
      } while (nextToken);

      return {
        files: allFiles,
        folders: allFolders,
        totalSize,
        totalItems: allFiles.length + allFolders.length,
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

        // Get all folder contents recursively to calculate true size and get all items
        const folderKey = folder.Prefix || folder.name;
        const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

        const folderContents = await getAllFolderContents(normalizedKey);

        // Update operation with actual size and file count, hide loading state
        operationsManager.setCalculatingSize(itemId, false);
        operationsManager.updateSize(
          itemId,
          folderContents.totalSize,
          folderContents.files.length + folderContents.folders.length
        );
        operationsManager.updateProgress({ itemId, progress: 5 }); // Small progress after calculation

        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        // Create array of all objects to delete (files first, then folders in reverse order)
        const allObjects = [
          ...folderContents.files,
          ...folderContents.folders.reverse(), // Delete folders in reverse order (deepest first)
          normalizedKey, // Finally delete the main folder
        ];

        if (allObjects.length > 0) {
          let deletedCount = 0;

          // Delete all objects individually since there's no batch delete
          for (const objectKey of allObjects) {
            if (signal?.aborted) {
              throw new Error('Operation cancelled');
            }

            await apiS3.deleteFile(objectKey);

            deletedCount++;
            // Use range 5-95% for actual deletion (more accurate progress)
            const progress = 5 + (deletedCount / allObjects.length) * 90;
            operationsManager.updateProgress({
              itemId,
              progress,
              completedFiles: deletedCount,
              totalFiles: allObjects.length,
            });
          }
        } else {
          // Empty folder, just delete the folder itself
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
    [apiS3, refreshCurrentData, errorFunction, getAllFolderContents]
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
