'use client';

import { create } from 'zustand';
import { UploadState, UploadItem, UploadProgress } from '../types';

interface DuplicateDialogState {
  isOpen: boolean;
  item: UploadItem | null;
  onReplace: (() => void) | null;
  onKeepBoth: (() => void) | null;
}

interface UploadStore extends UploadState {
  // Duplicate dialog state
  duplicateDialog: DuplicateDialogState;

  // Function registry
  actualCancelFunction: ((itemId: string) => Promise<void>) | null;
  actualPauseFunction: ((itemId: string) => void) | null;
  actualResumeFunction: ((itemId: string) => Promise<void>) | null;

  // Actions
  openCard: () => void;
  closeCard: () => void;
  forceCloseCard: () => void;
  minimizeCard: () => void;
  maximizeCard: () => void;
  addUploadItem: (item: Omit<UploadItem, 'id'>) => string;
  updateProgress: (progress: UploadProgress) => void;
  updateItemStatus: (itemId: string, status: UploadItem['status'], error?: string) => void;
  updateItemName: (itemId: string, name: string) => void;
  updateItemSize: (itemId: string, size: number, totalFiles?: number) => void;
  updateItemCalculatingSize: (itemId: string, isCalculating: boolean) => void;
  removeItem: (itemId: string) => void;
  clearCompleted: () => void;
  cancelUpload: (itemId: string) => void;
  pauseUpload: (itemId: string) => void;
  resumeUpload: (itemId: string) => void;
  resetStore: () => void;
  cleanupStaleStorage: () => void;

  // Function registration
  registerCancelFunction: (cancelFn: (itemId: string) => Promise<void>) => void;
  registerPauseFunction: (pauseFn: (itemId: string) => void) => void;
  registerResumeFunction: (resumeFn: (itemId: string) => Promise<void>) => void;

  // Duplicate dialog actions
  showDuplicateDialog: (item: UploadItem, onReplace: () => void, onKeepBoth: () => void) => void;
  hideDuplicateDialog: () => void;

  // Queue management
  getActiveUploadsCount: () => number;
  hasQueuedItems: () => boolean;
  forceRefresh: () => void;
}

const initialState: UploadState = {
  isOpen: false,
  isMinimized: false,
  items: [],
  totalItems: 0,
  completedItems: 0,
  isUploading: false,
};

export const useUploadStore = create<UploadStore>((set, get) => ({
  ...initialState,

  // Initialize duplicate dialog state
  duplicateDialog: {
    isOpen: false,
    item: null,
    onReplace: null,
    onKeepBoth: null,
  },

  // Initialize functions
  actualCancelFunction: null,
  actualPauseFunction: null,
  actualResumeFunction: null,

  openCard: () => {
    set({ isOpen: true, isMinimized: false });
  },

  closeCard: () => {
    const { isUploading } = get();
    if (!isUploading) {
      set({ isOpen: false, isMinimized: false });
    }
  },

  forceCloseCard: () => {
    set({ isOpen: false, isMinimized: false });
  },

  minimizeCard: () => {
    set({ isMinimized: true });
  },

  maximizeCard: () => {
    set({ isMinimized: false });
  },

  addUploadItem: (item) => {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: UploadItem = { ...item, id };

    set((state) => {
      const newState = {
        items: [newItem, ...state.items], // Add new items at the beginning
        totalItems: state.totalItems + 1,
        isOpen: true,
        isUploading: true,
      };

      return newState;
    });

    return id;
  },

  updateProgress: (progress) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === progress.itemId
          ? {
              ...item,
              progress: progress.progress,
              uploadedFiles: progress.uploadedFiles,
              totalFiles: progress.totalFiles,
              // Explicitly preserve file-related properties
              file: item.file,
              files: item.files,
            }
          : item
      ),
    }));
  },

  updateItemStatus: (itemId, status, error) => {
    set((state) => {
      const updatedItems = state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status,
              error,
              progress: status === 'completed' ? 100 : item.progress,
              // Explicitly preserve file-related properties
              file: item.file,
              files: item.files,
            }
          : item
      );

      const completedItems = updatedItems.filter(
        (item) =>
          item.status === 'completed' || item.status === 'error' || item.status === 'cancelled'
      ).length;

      const isUploading = updatedItems.some(
        (item) =>
          item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
      );

      return {
        items: updatedItems,
        completedItems,
        isUploading,
      };
    });
  },

  updateItemName: (itemId, name) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              name,
              // Explicitly preserve file-related properties
              file: item.file,
              files: item.files,
            }
          : item
      ),
    }));
  },

  updateItemSize: (itemId, size, totalFiles) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              size,
              ...(totalFiles && { totalFiles }),
              // Explicitly preserve file-related properties
              file: item.file,
              files: item.files,
            }
          : item
      ),
    }));
  },

  updateItemCalculatingSize: (itemId, isCalculating) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              isCalculatingSize: isCalculating,
              // Explicitly preserve file-related properties
              file: item.file,
              files: item.files,
            }
          : item
      ),
    }));
  },

  removeItem: (itemId) => {
    // Clean up all associated storage
    if (typeof window !== 'undefined') {
      // Clean up file cache
      import('../services/upload-file-cache').then(({ uploadFileCache }) => {
        uploadFileCache.remove(itemId);
      });

      // Clean up persistent storage
      import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
        persistentUploaderStorage.remove(itemId);
      });

      // Clean up any associated localStorage entries
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes(itemId)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
        });
      } catch (error) {
        console.warn('[UPLOAD_STORE] Error cleaning up localStorage:', error);
      }
    }

    set((state) => {
      const updatedItems = state.items.filter((item) => item.id !== itemId);
      const completedItems = updatedItems.filter(
        (item) =>
          item.status === 'completed' || item.status === 'error' || item.status === 'cancelled'
      ).length;

      const isUploading = updatedItems.some(
        (item) =>
          item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
      );

      return {
        items: updatedItems,
        totalItems: updatedItems.length,
        completedItems,
        isUploading,
        isOpen: updatedItems.length > 0,
      };
    });
  },

  clearCompleted: () => {
    set((state) => {
      const activeItems = state.items.filter(
        (item) =>
          item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
      );

      return {
        items: activeItems,
        totalItems: activeItems.length,
        completedItems: 0,
        isOpen: activeItems.length > 0,
      };
    });
  },

  cancelUpload: (itemId) => {
    const { actualCancelFunction } = get();

    if (actualCancelFunction) {
      actualCancelFunction(itemId).catch((error) => {
        console.error('Failed to cancel upload:', error);
      });
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, status: 'cancelled' as const } : item
      ),
    }));
  },

  pauseUpload: (itemId) => {
    const { actualPauseFunction } = get();

    if (actualPauseFunction) {
      actualPauseFunction(itemId);
    }
  },

  resumeUpload: (itemId) => {
    const { actualResumeFunction } = get();

    if (actualResumeFunction) {
      actualResumeFunction(itemId).catch((error) => {
        console.error('Failed to resume upload:', error);
      });
    }
  },

  resetStore: () => {
    set({
      ...initialState,
      duplicateDialog: {
        isOpen: false,
        item: null,
        onReplace: null,
        onKeepBoth: null,
      },
    });
  },

  showDuplicateDialog: (item, onReplace, onKeepBoth) => {
    set({
      duplicateDialog: {
        isOpen: true,
        item,
        onReplace,
        onKeepBoth,
      },
    });
  },

  hideDuplicateDialog: () => {
    set({
      duplicateDialog: {
        isOpen: false,
        item: null,
        onReplace: null,
        onKeepBoth: null,
      },
    });
  },

  getActiveUploadsCount: () => {
    const { items } = get();
    return items.filter((item) => item.status === 'uploading').length;
  },

  hasQueuedItems: () => {
    const { items } = get();
    return items.some((item) => item.status === 'pending');
  },

  // Function registration
  registerCancelFunction: (cancelFn) => {
    set({ actualCancelFunction: cancelFn });
  },

  registerPauseFunction: (pauseFn) => {
    set({ actualPauseFunction: pauseFn });
  },

  registerResumeFunction: (resumeFn) => {
    set({ actualResumeFunction: resumeFn });
  },

  cleanupStaleStorage: () => {
    // Import persistentUploaderStorage dynamically to avoid circular imports
    import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
      persistentUploaderStorage.cleanupStaleLocalStorage();
    });
  },

  forceRefresh: () => {
    // Force a re-render by updating a timestamp
    const currentState = get();
    set({ ...currentState });
  },
}));

// Setup global function for file cache to check active uploads
if (typeof window !== 'undefined') {
  window.__upload_store_check = (itemId: string): boolean => {
    const state = useUploadStore.getState();
    const item = state.items.find((item) => item.id === itemId);
    return !!(
      item &&
      (item.status === 'uploading' || item.status === 'paused' || item.status === 'pending')
    );
  };
}
