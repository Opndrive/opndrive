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
