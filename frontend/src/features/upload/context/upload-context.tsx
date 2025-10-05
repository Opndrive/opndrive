'use client';

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { UploadStatus } from '@opndrive/s3-api';
import { uploadManager } from '@/lib/uploadManagerInstance';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';

const UploadContext = createContext<null>(null);

export const UploadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { updateUpload, scheduleUploadRemoval } = useUploadStore();

  useEffect(() => {
    const handleStatusChange = ({
      id,
      status,
      progress,
    }: {
      id: string;
      status: UploadStatus;
      progress: number;
    }) => {
      updateUpload(id, { status, progress });

      // Schedule removal for completed or cancelled uploads
      if (status === 'completed' || status === 'cancelled') {
        scheduleUploadRemoval(id);
      }
    };

    const handleProgress = ({
      id,
      progress,
      status,
    }: {
      id: string;
      progress: number;
      status: UploadStatus;
    }) => {
      updateUpload(id, { progress, status });

      // Schedule removal for completed or cancelled uploads
      if (status === 'completed' || status === 'cancelled') {
        scheduleUploadRemoval(id);
      }
    };

    uploadManager.on('statusChange', handleStatusChange);
    uploadManager.on('progress', handleProgress);

    // Clean up the subscription when the component unmounts
    return () => {
      uploadManager.off('statusChange', handleStatusChange);
      uploadManager.off('progress', handleProgress);
    };
  }, [updateUpload, scheduleUploadRemoval]);

  return <UploadContext.Provider value={null}>{children}</UploadContext.Provider>;
};

export const useUploadContext = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUploadContext must be used within an UploadProvider');
  }
  return context;
};
