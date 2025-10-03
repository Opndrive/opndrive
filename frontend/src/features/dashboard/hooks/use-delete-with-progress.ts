'use client';

import { useCallback } from 'react';
import { useDeleteOperations } from '@/features/upload/hooks/use-delete-operations';
import { useUploadStore } from '@/features/upload/hooks/use-upload-store';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

export interface UseDeleteWithProgressReturn {
  deleteFile: (file: FileItem) => Promise<void>;
  deleteFolder: (folder: Folder) => Promise<void>;
  isDeleting: (itemId: string) => boolean;
  getActiveDeletes: () => string[];
}

export const useDeleteWithProgress = (): UseDeleteWithProgressReturn => {
  const { deleteFileWithProgress, deleteFolderWithProgress } = useDeleteOperations();
  const { items, openCard } = useUploadStore();

  const deleteFile = useCallback(
    async (file: FileItem) => {
      try {
        // Open the upload card to show delete progress
        openCard();

        await deleteFileWithProgress(file);
      } catch (error) {
        console.error('Delete file error:', error);
        throw error;
      }
    },
    [deleteFileWithProgress, openCard]
  );

  const deleteFolder = useCallback(
    async (folder: Folder) => {
      try {
        // Open the upload card to show delete progress
        openCard();

        await deleteFolderWithProgress(folder);
      } catch (error) {
        console.error('Delete folder error:', error);
        throw error;
      }
    },
    [deleteFolderWithProgress, openCard]
  );

  const isDeleting = useCallback(
    (itemId: string) => {
      return items.some(
        (item) =>
          item.operation === 'delete' &&
          (item.status === 'uploading' || item.status === 'pending') &&
          (item.id === itemId || item.name.includes(itemId))
      );
    },
    [items]
  );

  const getActiveDeletes = useCallback(() => {
    return items
      .filter(
        (item) =>
          item.operation === 'delete' && (item.status === 'uploading' || item.status === 'pending')
      )
      .map((item) => item.id);
  }, [items]);

  return {
    deleteFile,
    deleteFolder,
    isDeleting,
    getActiveDeletes,
  };
};
