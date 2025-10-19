'use client';

import React from 'react';
import { useAuth } from './use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Hook to protect components that require authentication
 * Redirects to home page if not authenticated
 */
export function useAuthGuard() {
  const { apiS3, uploadManager, signedUrlUploadManager, userCreds, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If not loading and no credentials, redirect to home
    if (!isLoading && !userCreds) {
      router.push('/');
    }
  }, [isLoading, userCreds, router]);

  // Return safe values - null if not properly authenticated
  return {
    apiS3: !isLoading && userCreds ? apiS3 : null,
    uploadManager: !isLoading && userCreds ? uploadManager : null,
    signedUrlUploadManager: !isLoading && userCreds ? signedUrlUploadManager : null,
    userCreds: !isLoading ? userCreds : null,
    isAuthenticated: !isLoading && !!userCreds && !!apiS3,
    isLoading,
  };
}

/**
 * Higher-order component to wrap components that need authentication
 */
export function withAuthGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> {
  return function AuthGuardedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuthGuard();

    if (isLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <p>Loading...</p>
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div className="flex h-screen items-center justify-center">
          <p>Redirecting...</p>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
}
