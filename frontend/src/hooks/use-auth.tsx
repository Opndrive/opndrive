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

export function useApiS3() {
  const { apiS3, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!apiS3) {
    return null;
  }
  return apiS3;
}
