'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UploadMode } from '../types';

interface UploadSettingsStore {
  uploadMode: UploadMode;
  setUploadMode: (mode: UploadMode) => void;
}

export const useUploadSettingsStore = create<UploadSettingsStore>()(
  persist(
    (set) => ({
      uploadMode: 'multipart',
      setUploadMode: (mode: UploadMode) => set({ uploadMode: mode }),
    }),
    {
      name: 'upload-settings-storage',
    }
  )
);
