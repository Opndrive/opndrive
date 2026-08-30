'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DuplicatePolicy, UploadMode } from '../types';

interface UploadSettingsStore {
  uploadMode: UploadMode;
  setUploadMode: (mode: UploadMode) => void;
  /**
   * The standing answer to "this file already exists". `ask` keeps the prompt,
   * and is the default: deciding to overwrite by default is the user's to make,
   * not one to inherit from an install.
   */
  duplicatePolicy: DuplicatePolicy;
  setDuplicatePolicy: (policy: DuplicatePolicy) => void;
}

export const useUploadSettingsStore = create<UploadSettingsStore>()(
  persist(
    (set) => ({
      uploadMode: 'multipart',
      setUploadMode: (mode: UploadMode) => set({ uploadMode: mode }),
      duplicatePolicy: 'ask',
      setDuplicatePolicy: (policy: DuplicatePolicy) => set({ duplicatePolicy: policy }),
    }),
    {
      name: 'upload-settings-storage',
    }
  )
);
