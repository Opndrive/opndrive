'use client';

import { UploadStatus, UploadManager, SignedUrlUploadManager } from '@opndrive/s3-api';
import { create } from 'zustand';
import { useDriveStore } from '@/context/data-context';

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
  /**
   * Created and owned by the store, never by a component. See
   * `startDeleteOperation` for why.
   */
  abortController?: AbortController;
  error?: string;
}

/** A delete in one of these states has already stopped; nothing left to abort. */
const FINISHED_DELETE_STATUSES: DeleteProgress['status'][] = ['completed', 'failed', 'cancelled'];

interface UploadStore {
  uploadManager: UploadManager | SignedUrlUploadManager | null;
  uploads: Record<string, UploadProgress>;
  deletes: Record<string, DeleteProgress>;
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
   *
   * Aborts running deletes before wiping: the map holds the only reference to
   * each abort controller, so dropping it first would leave a delete running
   * with no way left to stop it.
   */
  clearSessionData: () => void;
  /**
   * Registers a delete and returns the signal that stops it.
   *
   * The controller is built and held here rather than inside the calling hook
   * so its lifetime follows the session instead of whichever route happens to
   * be mounted. A hook-owned controller becomes unreachable the moment the
   * component unmounts, which left logout with no way to stop a delete already
   * running against the previous session's credentials.
   */
  startDeleteOperation: (
    id: string,
    operation: Omit<DeleteProgress, 'abortController'>
  ) => AbortSignal;
  /**
   * Stops every delete still in flight and marks it cancelled.
   *
   * Called on logout. The delete loop captured the old session's S3 client in
   * a closure, so without this a delete started before logout keeps deleting
   * with credentials the user has already signed out of.
   *
   * Deliberately NOT wired to component unmount - navigating from Browse to
   * Search must not abandon a 10,000 object delete halfway through.
   */
  abortAllDeleteOperations: () => void;
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

  // Enhanced data refresh methods
  refreshDataAfterUploadBatch: () => Promise<void>;
  forceRefreshData: () => Promise<void>;
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploadManager: null,

  setUploadManager: (manager) => set({ uploadManager: manager }),

  uploads: {},
  deletes: {},
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

  clearSessionData: () => {
    // Order matters. Wiping `deletes` drops the only reference to each abort
    // controller, so anything still running has to be stopped first or it can
    // never be stopped at all.
    get().abortAllDeleteOperations();

    set({
      uploads: {},
      deletes: {},
      duplicateQueue: [],
    });
  },

  // Delete operation methods
  startDeleteOperation: (id: string, operation: Omit<DeleteProgress, 'abortController'>) => {
    const abortController = new AbortController();

    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: { ...operation, abortController },
      },
    }));

    return abortController.signal;
  },

  abortAllDeleteOperations: () => {
    const running = Object.entries(get().deletes).filter(
      ([, operation]) => !FINISHED_DELETE_STATUSES.includes(operation.status)
    );
    if (running.length === 0) return;

    for (const [, operation] of running) {
      operation.abortController?.abort();
    }

    set((state) => ({
      deletes: {
        ...state.deletes,
        ...Object.fromEntries(
          running.map(([id, operation]) => [id, { ...operation, status: 'cancelled' as const }])
        ),
      },
    }));
  },

  updateDeleteProgress: (
    id: string,
    progress: number,
    completedFiles?: number,
    totalFiles?: number
  ) => {
    // A delete aborted on logout keeps running until its in-flight batch
    // resolves, and then reports progress for an operation that has already
    // been wiped. Spreading onto a missing entry would resurrect it as a card
    // with no name or status, in whichever session came next.
    if (!get().deletes[id]) return;

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
    }));
  },

  setCalculatingSize: (id: string, isCalculating: boolean) => {
    if (!get().deletes[id]) return;

    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          isCalculatingSize: isCalculating,
        },
      },
    }));
  },

  updateSize: (id: string, size: number, totalFiles?: number) => {
    if (!get().deletes[id]) return;

    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          size,
          ...(totalFiles !== undefined && { totalFiles }),
        },
      },
    }));
  },

  completeDeleteOperation: (id: string) => {
    if (!get().deletes[id]) return;

    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          status: 'completed',
          progress: 100,
        },
      },
    }));
  },

  failDeleteOperation: (id: string, error: string) => {
    if (!get().deletes[id]) return;

    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          status: 'failed',
          error,
        },
      },
    }));
  },

  cancelDeleteOperation: (id: string) => {
    if (!get().deletes[id]) return;

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
    });
  },

  isDeleteOperationActive: (id: string) => {
    const { deletes } = get();
    const deleteOp = deletes[id];
    return deleteOp && !FINISHED_DELETE_STATUSES.includes(deleteOp.status);
  },

  getDeleteAbortController: (id: string) => {
    const { deletes } = get();
    return deletes[id]?.abortController;
  },

  removeDeleteOperation: (id: string) => {
    // Same invariant as clearSessionData, for the same reason: this entry holds
    // the only reference to the controller. The operations modal removes a
    // delete to cancel it, so without this the card disappears and the loop
    // carries on deleting with nothing left that could stop it.
    const operation = get().deletes[id];
    if (operation && !FINISHED_DELETE_STATUSES.includes(operation.status)) {
      operation.abortController?.abort();
    }

    set((state) => ({
      deletes: Object.fromEntries(Object.entries(state.deletes).filter(([key]) => key !== id)),
    }));
  },

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
