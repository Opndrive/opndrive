'use client';

import { UploadStatus } from '@opndrive/s3-api';
import { create } from 'zustand';
import { uploadManager } from '@/lib/uploadManagerInstance';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';

interface UploadProgress {
  id: string;
  name: string;
  status: UploadStatus;
  progress: number;
  type: 'file' | 'folder';
  parentFolderId?: string; // For files that belong to a folder
  fileIds?: string[]; // For folders, track their file IDs
}

interface DeleteProgress {
  id: string;
  name: string;
  status: 'queued' | 'deleting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  type: 'file' | 'folder';
  size?: number;
  totalFiles?: number;
  completedFiles?: number;
  operationLabel?: string;
  extension?: string;
  isCalculatingSize?: boolean;
  abortController?: AbortController;
  error?: string;
}

interface UploadStore {
  uploads: Record<string, UploadProgress>;
  deletes: Record<string, DeleteProgress>;
  setUploads: (uploads: Record<string, UploadProgress>) => void;
  addUpload: (id: string, upload: UploadProgress) => void;
  updateUpload: (id: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  handleFilesDroppedToDirectory: (
    processedData: ProcessedDragData,
    currentPrefix: string | null
  ) => Promise<void>;
  handleFilesDroppedToFolder: (
    processedData: ProcessedDragData,
    targetFolder: DragDropTarget,
    currentPrefix: string | null
  ) => Promise<void>;

  // Delete operation methods
  addDeleteOperation: (id: string, operation: DeleteProgress) => void;
  updateDeleteProgress: (
    id: string,
    progress: number,
    completedFiles?: number,
    totalFiles?: number
  ) => void;
  setCalculatingSize: (id: string, isCalculating: boolean) => void;
  updateSize: (id: string, size: number, totalFiles?: number) => void;
  completeDeleteOperation: (id: string) => void;
  failDeleteOperation: (id: string, error: string) => void;
  cancelDeleteOperation: (id: string) => void;
  isDeleteOperationActive: (id: string) => boolean;
  getDeleteAbortController: (id: string) => AbortController | undefined;
  removeDeleteOperation: (id: string) => void;
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploads: {},
  deletes: {},

  setUploads: (uploads: Record<string, UploadProgress>) => set({ uploads }),

  addUpload: (id: string, upload: UploadProgress) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: upload,
      },
    })),

  updateUpload: (id: string, updates: Partial<UploadProgress>) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: {
          ...state.uploads[id],
          ...updates,
        },
      },
    })),

  removeUpload: (id: string) =>
    set((state) => ({
      uploads: Object.fromEntries(Object.entries(state.uploads).filter(([key]) => key !== id)),
    })),

  clearCompleted: () =>
    set((state) => ({
      uploads: Object.fromEntries(
        Object.entries(state.uploads).filter(
          ([_, upload]) => !['completed', 'cancelled', 'failed'].includes(upload.status)
        )
      ),
    })),

  clearAll: () => set({ uploads: {} }),

  handleFilesDroppedToDirectory: async (
    processedData: ProcessedDragData,
    currentPrefix: string | null
  ) => {
    const { addUpload } = get();

    if (processedData.individualFiles.length > 0) {
      processedData.individualFiles.forEach((file) => {
        // The key is the full path in S3
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}${file.name}`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}${file.name}`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}${file.name}`;
        } else {
          key = file.name;
        }

        const id = uploadManager.addUpload(file, { key });
        // Add to our local state immediately for instant UI feedback
        addUpload(id, { id, name: file.name, status: 'queued', progress: 0, type: 'file' });
      });
    }

    // 2. Upload Folders
    if (processedData.folderStructures.length > 0) {
      processedData.folderStructures.forEach((folder) => {
        // The `addFolderUpload` method handles the rest
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}`;
        }

        const { folderId, fileIds } = uploadManager.addFolderUpload(
          folder.files as unknown as FileList,
          {
            basePrefix: key,
          }
        );

        // Add folder to our local state
        addUpload(folderId, {
          id: folderId,
          name: folder.name,
          status: 'queued',
          progress: 0,
          type: 'folder',
          fileIds: fileIds,
        });

        // Add all files from the folder to our local state for UI feedback
        fileIds.forEach((id: string, index: number) => {
          const file = folder.files[index];
          addUpload(id, {
            id,
            name: file.webkitRelativePath,
            status: 'queued',
            progress: 0,
            type: 'file',
            parentFolderId: folderId,
          });
        });
      });
    }
  },

  handleFilesDroppedToFolder: async (
    processedData: ProcessedDragData,
    targetFolder: DragDropTarget,
    currentPrefix: string | null
  ) => {
    const { addUpload } = get();

    if (processedData.individualFiles.length > 0) {
      processedData.individualFiles.forEach((file) => {
        // The key is the full path in S3
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/${file.name}`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}${targetFolder.name}/${file.name}`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}${targetFolder.name}/${file.name}`;
        } else {
          key = `${targetFolder.name}/${file.name}`;
        }

        const id = uploadManager.addUpload(file, { key });
        // Add to our local state immediately for instant UI feedback
        addUpload(id, { id, name: file.name, status: 'queued', progress: 0, type: 'file' });
      });
    }

    // 2. Upload Folders
    if (processedData.folderStructures.length > 0) {
      processedData.folderStructures.forEach((folder) => {
        // The `addFolderUpload` method handles the rest
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}${targetFolder.name}/`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}${targetFolder.name}/`;
        } else {
          key = `${targetFolder.name}/`;
        }

        const { folderId, fileIds } = uploadManager.addFolderUpload(
          folder.files as unknown as FileList,
          {
            basePrefix: key,
          }
        );

        // Add folder to our local state
        addUpload(folderId, {
          id: folderId,
          name: folder.name,
          status: 'queued',
          progress: 0,
          type: 'folder',
          fileIds: fileIds,
        });

        // Add all files from the folder to our local state for UI feedback
        fileIds.forEach((id: string, index: number) => {
          const file = folder.files[index];
          addUpload(id, {
            id,
            name: file.webkitRelativePath,
            status: 'queued',
            progress: 0,
            type: 'file',
            parentFolderId: folderId,
          });
        });
      });
    }
  },

  // Delete operation methods
  addDeleteOperation: (id: string, operation: DeleteProgress) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: operation,
      },
    })),

  updateDeleteProgress: (
    id: string,
    progress: number,
    completedFiles?: number,
    totalFiles?: number
  ) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          progress,
          ...(completedFiles !== undefined && { completedFiles }),
          ...(totalFiles !== undefined && { totalFiles }),
        },
      },
    })),

  setCalculatingSize: (id: string, isCalculating: boolean) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          isCalculatingSize: isCalculating,
        },
      },
    })),

  updateSize: (id: string, size: number, totalFiles?: number) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          size,
          ...(totalFiles !== undefined && { totalFiles }),
        },
      },
    })),

  completeDeleteOperation: (id: string) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          status: 'completed',
          progress: 100,
        },
      },
    })),

  failDeleteOperation: (id: string, error: string) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          status: 'failed',
          error,
        },
      },
    })),

  cancelDeleteOperation: (id: string) =>
    set((state) => {
      const deleteOp = state.deletes[id];
      if (deleteOp?.abortController) {
        deleteOp.abortController.abort();
      }
      return {
        deletes: {
          ...state.deletes,
          [id]: {
            ...deleteOp,
            status: 'cancelled',
          },
        },
      };
    }),

  isDeleteOperationActive: (id: string) => {
    const { deletes } = get();
    const deleteOp = deletes[id];
    return deleteOp && !['completed', 'failed', 'cancelled'].includes(deleteOp.status);
  },

  getDeleteAbortController: (id: string) => {
    const { deletes } = get();
    return deletes[id]?.abortController;
  },

  removeDeleteOperation: (id: string) =>
    set((state) => ({
      deletes: Object.fromEntries(Object.entries(state.deletes).filter(([key]) => key !== id)),
    })),
}));
