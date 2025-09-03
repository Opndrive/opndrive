'use client';

import { create } from 'zustand';
import { UploadState, UploadItem, UploadProgress } from '../types';

interface UploadStore extends UploadState {
  // Actions
  openCard: () => void;
  closeCard: () => void;
  minimizeCard: () => void;
  maximizeCard: () => void;
  addUploadItem: (item: Omit<UploadItem, 'id'>) => string;
  updateProgress: (progress: UploadProgress) => void;
  updateItemStatus: (itemId: string, status: UploadItem['status'], error?: string) => void;
  removeItem: (itemId: string) => void;
  clearCompleted: () => void;
  cancelUpload: (itemId: string) => void;
  resetStore: () => void;
  // Queue management
  getActiveUploadsCount: () => number;
  hasQueuedItems: () => boolean;
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

  openCard: () => {
    set({ isOpen: true, isMinimized: false });
  },

  closeCard: () => {
    const { isUploading } = get();
    if (!isUploading) {
      set({ isOpen: false, isMinimized: false });
    }
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
        items: [...state.items, newItem],
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
            }
          : item
      ),
    }));
  },

  updateItemStatus: (itemId, status, error) => {
    set((state) => {
      const updatedItems = state.items.map((item) =>
        item.id === itemId
          ? { ...item, status, error, progress: status === 'completed' ? 100 : item.progress }
          : item
      );

      const completedItems = updatedItems.filter(
        (item) =>
          item.status === 'completed' || item.status === 'error' || item.status === 'cancelled'
      ).length;

      const isUploading = updatedItems.some(
        (item) => item.status === 'uploading' || item.status === 'pending'
      );

      return {
        items: updatedItems,
        completedItems,
        isUploading,
      };
    });
  },

  removeItem: (itemId) => {
    set((state) => {
      const updatedItems = state.items.filter((item) => item.id !== itemId);
      const completedItems = updatedItems.filter(
        (item) =>
          item.status === 'completed' || item.status === 'error' || item.status === 'cancelled'
      ).length;

      const isUploading = updatedItems.some(
        (item) => item.status === 'uploading' || item.status === 'pending'
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
        (item) => item.status === 'uploading' || item.status === 'pending'
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
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, status: 'cancelled' as const } : item
      ),
    }));
  },

  resetStore: () => {
    set(initialState);
  },

  getActiveUploadsCount: () => {
    const { items } = get();
    return items.filter((item) => item.status === 'uploading').length;
  },

  hasQueuedItems: () => {
    const { items } = get();
    return items.some((item) => item.status === 'pending');
  },
}));
