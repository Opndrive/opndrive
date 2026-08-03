'use client';

import { UploadStatus, UploadManager, SignedUrlUploadManager } from '@opndrive/s3-api';
import { create } from 'zustand';
import { useDriveStore } from '@/context/data-context';

// Enhanced batch tracking types
interface UploadBatch {
  id: string;
  type: 'file' | 'folder' | 'mixed';
  uploadIds: string[];
  completedCount: number;
  totalCount: number;
  createdAt: number;
  lastActivity: number;
  isComplete: boolean;
  hasTriggeredRefresh: boolean; // Track if this batch already triggered a refresh
}

interface RefreshState {
  isRefreshing: boolean;
  lastRefreshAttempt: number;
}

// Global refresh state management
const refreshState: RefreshState = {
  isRefreshing: false,
  lastRefreshAttempt: 0,
};

// Constants for timing
const MIN_REFRESH_INTERVAL_MS = 3000; // Prevent spam refreshing

export interface DuplicateItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  files?: File[];
}

/**
 * One pending "this already exists" question.
 *
 * These are queued rather than kept in a single slot. Two drops that both hit a
 * duplicate used to overwrite each other: the second prompt replaced the first,
 * and the first prompt's callbacks went with it - so the upload that was
 * waiting on that answer never resolved and simply hung.
 */
export interface DuplicatePrompt {
  id: string;
  duplicateItem: DuplicateItem;
  onReplace: () => void;
  onKeepBoth: () => void;
}

interface UploadProgress {
  id: string;
  name: string;
  status: UploadStatus;
  progress: number;
  type: 'file' | 'folder';
  /** Why this entry failed. Shown in the operations card. */
  error?: string;
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
  uploadManager: UploadManager | SignedUrlUploadManager | null;
  uploads: Record<string, UploadProgress>;
  deletes: Record<string, DeleteProgress>;
  batches: Record<string, UploadBatch>;
  /** Pending duplicate questions, oldest first. The UI renders index 0. */
  duplicateQueue: DuplicatePrompt[];
  setUploadManager: (manager: UploadManager | SignedUrlUploadManager | null) => void;
  setUploads: (uploads: Record<string, UploadProgress>) => void;
  addUpload: (id: string, upload: UploadProgress) => void;
  updateUpload: (id: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  /**
   * Wipes everything tied to the current session: upload history, delete
   * history, batch tracking, and any open duplicate prompt. Called on logout
   * so records from one bucket cannot surface in the next session - disposing
   * the upload managers emits a 'cancelled' event per in-flight item, and
   * those land here before the provider unmounts.
   */
  clearSessionData: () => void;
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

  // Duplicate dialog methods
  showDuplicateDialog: (
    duplicateItem: DuplicateItem,
    onReplace: () => void,
    onKeepBoth: () => void
  ) => void;
  /**
   * Runs the head prompt's chosen callback. Deliberately does NOT dequeue: the
   * dialog component calls the choice handler and then onClose, so dequeuing
   * here as well would skip the next prompt.
   */
  resolveDuplicate: (choice: 'replace' | 'keepBoth') => void;
  /** Dismisses the head prompt, revealing the next one. */
  hideDuplicateDialog: () => void;

  // Batch tracking methods
  createUploadBatch: (type: UploadBatch['type'], uploadIds: string[]) => string;
  updateBatchProgress: (batchId: string, uploadId: string, isCompleted: boolean) => void;
  getBatch: (batchId: string) => UploadBatch | undefined;
  isBatchComplete: (batchId: string) => boolean;
  cleanupCompletedBatches: () => void;

  // Enhanced data refresh methods
  refreshDataAfterUploadBatch: () => Promise<void>;
  forceRefreshData: () => Promise<void>;
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploadManager: null,

  setUploadManager: (manager) => set({ uploadManager: manager }),

  uploads: {},
  deletes: {},
  batches: {},
  duplicateQueue: [],

  setUploads: (uploads: Record<string, UploadProgress>) => set({ uploads }),

  addUpload: (id: string, upload: UploadProgress) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: upload,
      },
    })),

  updateUpload: (id: string, updates: Partial<UploadProgress>) => {
    // Ignore events for uploads we are no longer tracking. Disposing the upload
    // managers on logout emits a trailing 'cancelled' per in-flight item, which
    // can arrive after clearSessionData() has already run - spreading onto an
    // absent entry would resurrect it as a malformed card with no name or type.
    if (!get().uploads[id]) return;

    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: {
          ...state.uploads[id],
          ...updates,
        },
      },
    }));

    // Smart refresh on upload completion
    if (updates.status === 'completed') {
      const { refreshDataAfterUploadBatch } = get();
      const state = get();
      const completedUpload = state.uploads[id];

      if (completedUpload.type === 'file' && !completedUpload.parentFolderId) {
        // Individual file completed (not part of a folder) - refresh immediately
        refreshDataAfterUploadBatch().catch(() => {
          // Silently handle refresh errors
        });
      } else if (completedUpload.type === 'file' && completedUpload.parentFolderId) {
        // File is part of a folder - check if entire folder is complete
        const parentFolderId = completedUpload.parentFolderId;
        const folderUpload = state.uploads[parentFolderId];

        if (folderUpload && folderUpload.fileIds) {
          // Check if all files in the folder are completed
          const allFilesCompleted = folderUpload.fileIds.every((fileId) => {
            const fileUpload = state.uploads[fileId];
            return fileUpload && fileUpload.status === 'completed';
          });

          if (allFilesCompleted) {
            refreshDataAfterUploadBatch().catch(() => {
              // Silently handle refresh errors
            });
          }
        }
      } else if (completedUpload.type === 'folder') {
        // Folder upload completed - refresh immediately
        refreshDataAfterUploadBatch().catch(() => {
          // Silently handle refresh errors
        });
      }
    }
  },

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

  clearSessionData: () =>
    set({
      uploads: {},
      deletes: {},
      batches: {},
      duplicateQueue: [],
    }),

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

  // Duplicate dialog methods
  showDuplicateDialog: (duplicateItem, onReplace, onKeepBoth) =>
    set((state) => ({
      duplicateQueue: [
        ...state.duplicateQueue,
        {
          id: `dup_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          duplicateItem,
          onReplace,
          onKeepBoth,
        },
      ],
    })),

  resolveDuplicate: (choice) => {
    const prompt = get().duplicateQueue[0];
    if (!prompt) return;

    // Only invokes; hideDuplicateDialog does the dequeue. The dialog component
    // calls the choice handler and then onClose, so dequeuing here too would
    // drop the prompt behind this one.
    if (choice === 'replace') prompt.onReplace();
    else prompt.onKeepBoth();
  },

  hideDuplicateDialog: () =>
    set((state) => ({
      duplicateQueue: state.duplicateQueue.slice(1),
    })),

  // Batch tracking methods
  createUploadBatch: (type: UploadBatch['type'], uploadIds: string[]): string => {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const batch: UploadBatch = {
      id: batchId,
      type,
      uploadIds: [...uploadIds],
      completedCount: 0,
      totalCount: uploadIds.length,
      createdAt: now,
      lastActivity: now,
      isComplete: false,
      hasTriggeredRefresh: false,
    };

    set((state) => ({
      batches: {
        ...state.batches,
        [batchId]: batch,
      },
    }));

    return batchId;
  },

  updateBatchProgress: (batchId: string, uploadId: string, isCompleted: boolean) => {
    set((state) => {
      const batch = state.batches[batchId];
      if (!batch) return state;

      const _wasAlreadyCompleted = batch.isComplete;
      const newCompletedCount = isCompleted ? batch.completedCount + 1 : batch.completedCount;

      const isNowComplete = newCompletedCount >= batch.totalCount;

      return {
        batches: {
          ...state.batches,
          [batchId]: {
            ...batch,
            completedCount: newCompletedCount,
            lastActivity: Date.now(),
            isComplete: isNowComplete,
          },
        },
      };
    });
  },

  getBatch: (batchId: string): UploadBatch | undefined => {
    return get().batches[batchId];
  },

  isBatchComplete: (batchId: string): boolean => {
    const batch = get().batches[batchId];
    return batch?.isComplete ?? false;
  },

  cleanupCompletedBatches: () => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    set((state) => ({
      batches: Object.fromEntries(
        Object.entries(state.batches).filter(([, batch]) => {
          return !batch.isComplete || now - batch.lastActivity < maxAge;
        })
      ),
    }));
  },

  // Simple immediate data refresh on upload completion
  refreshDataAfterUploadBatch: async (): Promise<void> => {
    const now = Date.now();

    // Prevent spam refreshing
    if (
      refreshState.isRefreshing ||
      now - refreshState.lastRefreshAttempt < MIN_REFRESH_INTERVAL_MS
    ) {
      return;
    }

    refreshState.isRefreshing = true;
    refreshState.lastRefreshAttempt = now;

    try {
      // Get refreshCurrentData function from data context
      const { refreshCurrentData } = useDriveStore.getState();
      await refreshCurrentData();
    } finally {
      refreshState.isRefreshing = false;
    }
  },

  forceRefreshData: async (): Promise<void> => {
    refreshState.isRefreshing = true;

    try {
      const { refreshCurrentData } = useDriveStore.getState();
      await refreshCurrentData();
    } finally {
      refreshState.isRefreshing = false;
      refreshState.lastRefreshAttempt = Date.now();
    }
  },
}));
