'use client';

import { useContext, useEffect } from 'react';
import { AuthContext } from './auth-context';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';

export function ZustandBridge() {
  const { uploadManager, signedUrlUploadManager } = useContext(AuthContext);
  const { uploadMode } = useUploadSettingsStore();

  const setUploadManager = useUploadStore((state) => state.setUploadManager);

  useEffect(() => {
    console.log('Here i am changing the upload manager type');
    if (uploadMode === 'signed-url') {
      console.log('inside signed url');
      setUploadManager(signedUrlUploadManager);
      return;
    }
    console.log('inside multipart url');
    setUploadManager(uploadManager);
  }, [uploadMode, uploadManager, signedUrlUploadManager, setUploadManager]);

  return null;
}
