'use client';

import { useCallback } from 'react';
import { useDeleteOperations } from '@/features/upload/hooks/use-delete-operations';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

export interface UseDeleteWithProgressReturn {
  deleteFile: (file: FileItem) => Promise<void>;
  deleteFolder: (folder: Folder) => Promise<void>;
  batchDeleteFiles: (files: FileItem[]) => Promise<void>;
  isDeleting: (itemId: string) => boolean;
  getActiveDeletes: () => string[];
}

export const useDeleteWithProgress = (): UseDeleteWithProgressReturn => {
  const { deleteFileWithProgress, deleteFolderWithProgress, batchDelete } = useDeleteOperations();
  const { deletes } = useUploadStore();

  const deleteFile = useCallback(
    async (file: FileItem) => {
      try {
        await deleteFileWithProgress(file);
      } catch (error) {
        console.error('Delete file error:', error);
        throw error;
      }
    },
    [deleteFileWithProgress]
  );

  const deleteFolder = useCallback(
    async (folder: Folder) => {
      try {
        await deleteFolderWithProgress(folder);
      } catch (error) {
        console.error('Delete folder error:', error);
        throw error;
      }
    },
    [deleteFolderWithProgress]
  );

  const batchDeleteFiles = useCallback(
    async (files: FileItem[]) => {
      try {
        await batchDelete(files);
      } catch (error) {
        console.error('Batch delete error:', error);
        throw error;
      }
    },
    [batchDelete]
  );

  const isDeleting = useCallback(
    (itemId: string) => {
      return Object.values(deletes).some(
        (deleteOp) =>
          (deleteOp.status === 'deleting' || deleteOp.status === 'queued') &&
          (deleteOp.id === itemId || deleteOp.name.includes(itemId))
      );
    },
    [deletes]
  );

  const getActiveDeletes = useCallback(() => {
    return Object.values(deletes)
      .filter((deleteOp) => deleteOp.status === 'deleting' || deleteOp.status === 'queued')
      .map((deleteOp) => deleteOp.id);
  }, [deletes]);

  return {
    deleteFile,
    deleteFolder,
    batchDeleteFiles,
    isDeleting,
    getActiveDeletes,
  };
};
