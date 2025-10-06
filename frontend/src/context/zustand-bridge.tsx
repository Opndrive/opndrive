'use client';

import { useContext, useEffect } from 'react';
import { AuthContext } from './auth-context';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';

export function ZustandBridge() {
  const { uploadManager } = useContext(AuthContext);

  const setUploadManager = useUploadStore((state) => state.setUploadManager);

  useEffect(() => {
    setUploadManager(uploadManager);
  }, [uploadManager, setUploadManager]);

  return null;
}
