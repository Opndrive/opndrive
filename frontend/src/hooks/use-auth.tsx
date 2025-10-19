'use client';

import { useContext } from 'react';
import { AuthContext } from '@/context/auth-context';

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function useUploadManager() {
  const { uploadManager, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!uploadManager) {
    return null;
  }
  return uploadManager;
}

export function useSignedUrlUploadManager() {
  const { signedUrlUploadManager, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!signedUrlUploadManager) {
    return null;
  }
  return signedUrlUploadManager;
}

export function useActiveUploadManager() {
  const { uploadManager, signedUrlUploadManager, isLoading } = useAuth();
  const { uploadMode } = useUploadSettingsStore();

  if (isLoading) {
    return null;
  }

  if (uploadMode === 'signed-url') {
    return signedUrlUploadManager;
  }

  return uploadManager;
}

// Import at the bottom to avoid circular dependency
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';
