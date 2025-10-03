/**
 * Upload State Manager
 *
 * Enterprise-grade state management for uploads with persistence,
 * error recovery, and proper separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { uploadPersistence, UploadMetadata } from '../services/upload-persistence';
import { UploadItem } from '../types';

interface UploadState {
  items: UploadItem[];
  isOpen: boolean;
  isMinimized: boolean;
  totalItems: number;
  completedItems: number;
  isUploading: boolean;
  isInitialized: boolean;
}

interface UploadActions {
  // Initialization
  initialize: () => Promise<void>;

  // Item management
  addUploadItem: (item: Omit<UploadItem, 'id'>, files?: File[]) => Promise<string>;
  updateItemStatus: (itemId: string, status: UploadItem['status'], error?: string) => Promise<void>;
  updateItemProgress: (
    itemId: string,
    progress: number,
    uploadedFiles?: number,
    totalFiles?: number
  ) => Promise<void>;
  updateItemName: (itemId: string, name: string) => Promise<void>;
  updateItemSize: (itemId: string, size: number) => Promise<void>;
  updateItemCalculatingSize: (itemId: string, isCalculating: boolean) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;

  // Bulk operations
  clearCompleted: () => Promise<void>;
  refreshFromPersistence: () => Promise<void>;

  // UI state
  openCard: () => void;
  closeCard: () => void;
  forceCloseCard: () => void;
  minimizeCard: () => void;
  maximizeCard: () => void;

  // File retrieval
  getItemFiles: (itemId: string) => Promise<File[] | null>;
  getItem: (itemId: string) => UploadItem | undefined;

  // Function registration for external handlers
  registerCancelFunction: (fn: (itemId: string) => Promise<void>) => void;
  registerPauseFunction: (fn: (itemId: string) => void) => void;
  registerResumeFunction: (fn: (itemId: string) => Promise<void>) => void;

  // Action execution
  cancelUpload: (itemId: string) => void;
  pauseUpload: (itemId: string) => void;
  resumeUpload: (itemId: string) => void;
}

interface UploadStore extends UploadState, UploadActions {
  // Function registries
  actualCancelFunction: ((itemId: string) => Promise<void>) | null;
  actualPauseFunction: ((itemId: string) => void) | null;
  actualResumeFunction: ((itemId: string) => Promise<void>) | null;
}

// Convert metadata to upload item
function metadataToItem(metadata: UploadMetadata): UploadItem {
  return {
    id: metadata.id,
    name: metadata.name,
    type: metadata.type,
    size: metadata.size,
    progress: metadata.progress,
    status: metadata.status,
    error: metadata.error,
    destination: metadata.destination,
    extension: metadata.extension,
    uploadedFiles: metadata.uploadedFiles,
    totalFiles: metadata.totalFiles,
    operation: metadata.operation,
    // Note: file and files properties will be populated separately via getItemFiles
  };
}

// Convert upload item to metadata
function itemToMetadata(item: UploadItem): Omit<UploadMetadata, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: item.name,
    type: item.type,
    size: item.size,
    progress: item.progress,
    status: item.status,
    error: item.error,
    destination: item.destination,
    extension: item.extension,
    uploadedFiles: item.uploadedFiles,
    totalFiles: item.totalFiles,
    operation: item.operation,
  };
}

const initialState: UploadState = {
  items: [],
  isOpen: false,
  isMinimized: false,
  totalItems: 0,
  completedItems: 0,
  isUploading: false,
  isInitialized: false,
};

export const useUploadStore = create<UploadStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Function registries
    actualCancelFunction: null,
    actualPauseFunction: null,
    actualResumeFunction: null,

    initialize: async () => {
      try {
        await uploadPersistence.initialize();
        await get().refreshFromPersistence();

        // Cleanup old uploads on initialization
        await uploadPersistence.cleanup();

        set({ isInitialized: true });
      } catch (error) {
        console.error('Failed to initialize upload store:', error);
        set({ isInitialized: true }); // Continue even if persistence fails
      }
    },

    addUploadItem: async (item, files) => {
      const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        // Save to persistence first
        await uploadPersistence.saveUpload(id, itemToMetadata({ ...item, id }), files);

        // Then update state
        const newItem: UploadItem = { ...item, id };
        set((state) => ({
          items: [...state.items, newItem],
          totalItems: state.totalItems + 1,
          isOpen: true,
          isUploading: true,
        }));

        return id;
      } catch (error) {
        console.error('Failed to add upload item:', error);
        throw error;
      }
    },

    updateItemStatus: async (itemId, status, error) => {
      try {
        // Update persistence first
        await uploadPersistence.updateUpload(itemId, {
          status,
          error,
          progress: status === 'completed' ? 100 : undefined,
        });

        // Then update state
        set((state) => {
          const updatedItems = state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status,
                  error,
                  progress: status === 'completed' ? 100 : item.progress,
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
      } catch (error) {
        console.error('Failed to update item status:', error);
      }
    },

    updateItemProgress: async (itemId, progress, uploadedFiles, totalFiles) => {
      try {
        // Update persistence
        await uploadPersistence.updateUpload(itemId, {
          progress,
          uploadedFiles,
          totalFiles,
        });

        // Update state
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  progress,
                  uploadedFiles,
                  totalFiles,
                }
              : item
          ),
        }));
      } catch (error) {
        console.error('Failed to update item progress:', error);
      }
    },

    updateItemName: async (itemId, name) => {
      try {
        await uploadPersistence.updateUpload(itemId, { name });

        set((state) => ({
          items: state.items.map((item) => (item.id === itemId ? { ...item, name } : item)),
        }));
      } catch (error) {
        console.error('Failed to update item name:', error);
      }
    },

    updateItemSize: async (itemId, size) => {
      try {
        await uploadPersistence.updateUpload(itemId, { size });

        set((state) => ({
          items: state.items.map((item) => (item.id === itemId ? { ...item, size } : item)),
        }));
      } catch (error) {
        console.error('Failed to update item size:', error);
      }
    },

    updateItemCalculatingSize: async (itemId, isCalculating) => {
      try {
        // This is UI-only state, no need to persist
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId ? { ...item, isCalculatingSize: isCalculating } : item
          ),
        }));
      } catch (error) {
        console.error('Failed to update item calculating size state:', error);
      }
    },

    removeItem: async (itemId) => {
      try {
        await uploadPersistence.deleteUpload(itemId);

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
      } catch (error) {
        console.error('Failed to remove item:', error);
      }
    },

    clearCompleted: async () => {
      try {
        await uploadPersistence.clearCompleted();
        await get().refreshFromPersistence();
      } catch (error) {
        console.error('Failed to clear completed items:', error);
      }
    },

    refreshFromPersistence: async () => {
      try {
        const metadata = await uploadPersistence.getAllUploads();
        const items = metadata.map(metadataToItem);

        const completedItems = items.filter(
          (item) =>
            item.status === 'completed' || item.status === 'error' || item.status === 'cancelled'
        ).length;

        const isUploading = items.some(
          (item) =>
            item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
        );

        set({
          items,
          totalItems: items.length,
          completedItems,
          isUploading,
          isOpen: items.length > 0,
        });
      } catch (error) {
        console.error('Failed to refresh from persistence:', error);
      }
    },

    getItemFiles: async (itemId) => {
      try {
        return await uploadPersistence.getUploadFiles(itemId);
      } catch (error) {
        console.error('Failed to get item files:', error);
        return null;
      }
    },

    getItem: (itemId) => {
      return get().items.find((item) => item.id === itemId);
    },

    // UI State Management
    openCard: () => set({ isOpen: true, isMinimized: false }),

    closeCard: () => {
      const { isUploading } = get();
      if (!isUploading) {
        set({ isOpen: false, isMinimized: false });
      }
    },

    forceCloseCard: () => set({ isOpen: false, isMinimized: false }),
    minimizeCard: () => set({ isMinimized: true }),
    maximizeCard: () => set({ isMinimized: false }),

    // Function Registration
    registerCancelFunction: (fn) => set({ actualCancelFunction: fn }),
    registerPauseFunction: (fn) => set({ actualPauseFunction: fn }),
    registerResumeFunction: (fn) => set({ actualResumeFunction: fn }),

    // Action Execution
    cancelUpload: (itemId) => {
      const { actualCancelFunction } = get();
      if (actualCancelFunction) {
        actualCancelFunction(itemId).catch((error) => {
          console.error('Failed to cancel upload:', error);
        });
      }
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
  }))
);

// Initialize the store when module loads
uploadPersistence.initialize().then(() => {
  useUploadStore.getState().initialize();
});
