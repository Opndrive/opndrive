'use client';

import { useContext, useEffect } from 'react';
import { AuthContext } from './auth-context';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';
import { managerForMode } from '@/features/upload/services/auto-upload-manager';

export function ZustandBridge() {
  const { uploadManager, signedUrlUploadManager } = useContext(AuthContext);
  const { uploadMode } = useUploadSettingsStore();

  const setUploadManager = useUploadStore((state) => state.setUploadManager);

  useEffect(() => {
    setUploadManager(managerForMode(uploadMode, uploadManager, signedUrlUploadManager));
  }, [uploadMode, uploadManager, signedUrlUploadManager, setUploadManager]);

  return null;
}
