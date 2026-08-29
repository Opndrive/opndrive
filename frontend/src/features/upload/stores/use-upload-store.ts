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
  onReplace: (applyToAll: boolean) => void;
  onKeepBoth: (applyToAll: boolean) => void;
  /**
   * Cancelling used to close the dialog and nothing else, leaving the promise
   * the caller was awaiting unresolved - so the rest of the drop was never
   * asked about and never uploaded. It is an answer like the other two now.
   */
  onCancel?: (applyToAll: boolean) => void;
  /** Collisions left in this drop, this one included. */
  remaining: number;
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

  /**
   * Where this upload lands, and what it will be once it has.
   *
   * A card used to carry nothing but progress, which is why finishing one could
   * do no better than re-list whatever prefix the user happened to be standing
   * in - the wrong folder entirely once they had walked away from the one they
   * uploaded into, and two full listings of a thousand objects either way.
   * These three are what let a finished upload add its own row instead.
   *
   * `destinationPrefix` is the listing that gains a row: for a file the prefix
   * holding it, for a folder the prefix *above* it, since the folder's own name
   * is already in `name`. `key` and `size` describe the object itself and are a
   * file's alone.
   *
   * All optional, because a card can exist without ever having reached the
   * executor - the one raised for a dispatch the manager refused has no
   * destination to speak of, and falls back to a re-read.
   */
  key?: string;
  size?: number;
  destinationPrefix?: string;
}

/**
 * Adds the row a finished upload produced to the listing it landed in.
 *
 * @returns false when the card does not carry enough to place a row, leaving
 * the caller to fall back to a re-read.
 */
function placeFinishedUpload(upload: UploadProgress): boolean {
  if (upload.destinationPrefix === undefined) return false;

  const { addFile, addFolder, removeFiles } = useDriveStore.getState();

  if (upload.type === 'folder') {
    addFolder(upload.destinationPrefix, upload.name);
    return true;
  }

  if (upload.key === undefined) return false;

  // Out and back in rather than a plain insert. An upload that answered the
  // duplicate prompt with "replace" has overwritten an object that is already
  // listed, and inserting would find the key present and leave that row showing
  // the size and time of the version it replaced. Removing first is a no-op
  // when there was nothing there, which is the ordinary case.
  removeFiles([upload.key]);
  addFile(upload.destinationPrefix, { key: upload.key, size: upload.size });

  return true;
}

interface DeleteProgress {
  id: string;
  name: string;
  status: 'queued' | 'deleting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  /**
   * What is being deleted, which is what picks the card's icon.
   *
   * 'mixed' exists because a multi-select is not necessarily either. Batch
   * deletes used to hardcode 'folder' here to get *an* icon, so deleting a
   * single photo drew a folder - and a selection of eight files drew a folder
   * too, next to a label that correctly read "Deleting 8 files".
   */
  type: 'file' | 'folder' | 'mixed';
  size?: number;
  totalFiles?: number;
  completedFiles?: number;
  operationLabel?: string;
  extension?: string;
  isCalculatingSize?: boolean;
  /**
   * The names of what is being deleted, for a card that would otherwise only
   * say how many.
   *
   * Precomputed to a single string rather than an array: the operations panel
   * memoises each row on shallow-equal props, and an array rebuilt on every
   * render defeats that for every row at once.
   */
  detail?: string;
  /**
   * Created and owned by the store, never by a component. See
   * `startDeleteOperation` for why.
   */
  abortController?: AbortController;
  error?: string;
}

/** A delete in one of these states has already stopped; nothing left to abort. */
const FINISHED_DELETE_STATUSES: DeleteProgress['status'][] = ['completed', 'failed', 'cancelled'];

/**
 * Why a delete was aborted, when the reason was the session ending rather than
 * the user asking.
 *
 * The two are not interchangeable to anything downstream. A user who cancels
 * has been told the delete stopped - the card goes, and they did it. A session
 * that ends underneath a running delete tells them nothing at all, and leaves a
 * folder with some of its contents gone. Passing this as the abort reason is
 * what lets the delete recovery record survive the second case and not the
 * first. See the `finally` in `deleteFolderWithProgress`.
 */
export const SESSION_ENDED = Symbol('delete aborted: session ended');

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
    onReplace: (applyToAll: boolean) => void,
    onKeepBoth: (applyToAll: boolean) => void,
    options?: {
      onCancel?: (applyToAll: boolean) => void;
      /** Collisions left in this drop, this one included. */
      remaining?: number;
    }
  ) => void;
  /**
   * Runs the head prompt's chosen callback. Deliberately does NOT dequeue: the
   * dialog component calls the choice handler and then onClose, so dequeuing
   * here as well would skip the next prompt.
   *
   * `applyToAll` is handed back to whoever raised the prompt rather than acted
   * on here. Prompts are raised one at a time - the loop in use-upload-dispatch
   * awaits each answer before asking the next - so honouring it means not
   * asking again, which only that loop is in a position to do.
   */
  resolveDuplicate: (choice: 'replace' | 'keepBoth' | 'cancel', applyToAll?: boolean) => void;
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

    // A finished upload adds its own row. Only a card that cannot say where it
    // landed falls back to re-listing.
    if (updates.status === 'completed') {
      const { refreshDataAfterUploadBatch } = get();
      const state = get();
      const completedUpload = state.uploads[id];

      const placeOrRefresh = (upload: UploadProgress) => {
        if (placeFinishedUpload(upload)) return;

        refreshDataAfterUploadBatch().catch(() => {
          // Silently handle refresh errors
        });
      };

      if (completedUpload.type === 'file' && !completedUpload.parentFolderId) {
        // A loose file, which is one row in the prefix it was dropped into.
        placeOrRefresh(completedUpload);
      } else if (completedUpload.type === 'file' && completedUpload.parentFolderId) {
        // A file inside a folder. Nothing is added for it on its own: the
        // listing that changes is the one *above* the folder, and it gains a
        // single row for the folder itself, once every file in it has landed.
        const parentFolderId = completedUpload.parentFolderId;
        const folderUpload = state.uploads[parentFolderId];

        if (folderUpload && folderUpload.fileIds) {
          // Check if all files in the folder are completed
          const allFilesCompleted = folderUpload.fileIds.every((fileId) => {
            const fileUpload = state.uploads[fileId];
            return fileUpload && fileUpload.status === 'completed';
          });

          if (allFilesCompleted) placeOrRefresh(folderUpload);
        }
      } else if (completedUpload.type === 'folder') {
        placeOrRefresh(completedUpload);
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
      operation.abortController?.abort(SESSION_ENDED);
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
  showDuplicateDialog: (duplicateItem, onReplace, onKeepBoth, options) =>
    set((state) => ({
      duplicateQueue: [
        ...state.duplicateQueue,
        {
          id: `dup_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          duplicateItem,
          onReplace,
          onKeepBoth,
          onCancel: options?.onCancel,
          remaining: options?.remaining ?? 1,
        },
      ],
    })),

  resolveDuplicate: (choice, applyToAll = false) => {
    const prompt = get().duplicateQueue[0];
    if (!prompt) return;

    // Only invokes; hideDuplicateDialog does the dequeue. The dialog component
    // calls the choice handler and then onClose, so dequeuing here too would
    // drop the prompt behind this one.
    if (choice === 'replace') prompt.onReplace(applyToAll);
    else if (choice === 'keepBoth') prompt.onKeepBoth(applyToAll);
    else prompt.onCancel?.(applyToAll);
  },

  hideDuplicateDialog: () =>
    set((state) => ({
      duplicateQueue: state.duplicateQueue.slice(1),
    })),

  /**
   * The fallback, for an upload that finished without enough on its card to
   * place a row of its own.
   *
   * Still throttled, because this is the expensive path - two full listings of
   * the prefix - and several landing together would each pay for it.
   *
   * Nothing throttles the row placement this now stands behind, and nothing
   * may: ten files finishing inside the same second each add their own row, and
   * a throttle there would silently drop nine of them.
   */
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

      // Silent: this runs over a listing that is already on screen, so it must
      // not announce itself as loading, and a failure must not replace those
      // rows with an error notice.
      await refreshCurrentData({ silent: true });
    } finally {
      refreshState.isRefreshing = false;
    }
  },

  forceRefreshData: async (): Promise<void> => {
    refreshState.isRefreshing = true;

    try {
      const { refreshCurrentData } = useDriveStore.getState();
      await refreshCurrentData({ silent: true });
    } finally {
      refreshState.isRefreshing = false;
      refreshState.lastRefreshAttempt = Date.now();
    }
  },
}));
