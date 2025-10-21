'use client';

import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  BYOS3ApiProvider,
  Credentials,
  UploadManager,
  SignedUrlUploadManager,
} from '@opndrive/s3-api';
import { useDriveStore } from './data-context';

interface AuthContextType {
  apiS3: BYOS3ApiProvider | null;
  uploadManager: UploadManager | null;
  signedUrlUploadManager: SignedUrlUploadManager | null;
  userCreds: Credentials | null;
  isLoading: boolean;
  createSession: (creds: Credentials) => Promise<void>;
  clearSession: () => void;
}

function isValidCreds(c: Credentials): c is Credentials {
  return (
    typeof c?.accessKeyId === 'string' &&
    typeof c?.secretAccessKey === 'string' &&
    typeof c?.region === 'string'
  );
}

export const AuthContext = createContext<AuthContextType>({
  apiS3: null,
  uploadManager: null,
  signedUrlUploadManager: null,
  userCreds: null,
  isLoading: true,
  createSession: async () => {
    throw new Error('AuthContext not initialized');
  },
  clearSession: () => {
    throw new Error('AuthContext not initialized');
  },
});

const STORAGE_KEY = 's3_user_session';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [apiS3, setApiS3] = useState<BYOS3ApiProvider | null>(null);
  const [uploadManager, setUploadManager] = useState<UploadManager | null>(null);
  const [signedUrlUploadManager, setSignedUrlUploadManager] =
    useState<SignedUrlUploadManager | null>(null);
  const [userCreds, setUserCreds] = useState<Credentials | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  // Get clearAllData at the top level where hooks are allowed
  const clearAllData = useDriveStore((state) => state.clearAllData);

  // Restore session from localStorage on app load
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const storedCreds = localStorage.getItem(STORAGE_KEY);
        if (storedCreds) {
          const creds = JSON.parse(storedCreds);
          if (isValidCreds(creds)) {
            const api = new BYOS3ApiProvider(creds, 'BYO');

            // Initialize both upload managers
            const manager = UploadManager.getInstance({
              s3: api.getS3Client(),
              bucket: api.getBucketName(),
              prefix: creds.prefix || '',
              maxConcurrency: 2,
              partSizeMB: 5,
            });

            const signedUrlManager = SignedUrlUploadManager.getInstance({
              apiProvider: api,
              maxConcurrency: 2,
              expiresInSeconds: 3600,
            });

            setUploadManager(manager);
            setSignedUrlUploadManager(signedUrlManager);
            setUserCreds(creds);
            setApiS3(api);

            // Only redirect to dashboard if user is on home page/connect page
            // Otherwise, stay on current route (preserve the URL after refresh)
            if (pathname === '/' || pathname === '/connect') {
              router.push('/dashboard');
            }
          } else {
            throw new Error('Invalid credentials in storage');
          }
        }
      } catch (error) {
        console.error('Failed to restore session : ', error);
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Create a session & persist in localStorage
  const createSession = async (creds: Credentials): Promise<void> => {
    try {
      setIsLoading(true);
      const api = new BYOS3ApiProvider(creds, 'BYO');

      // Initialize both upload managers
      const manager = UploadManager.getInstance({
        s3: api.getS3Client(),
        bucket: api.getBucketName(),
        prefix: creds.prefix || '',
        maxConcurrency: 2,
        partSizeMB: 5,
      });

      const signedUrlManager = SignedUrlUploadManager.getInstance({
        apiProvider: api,
        maxConcurrency: 2,
        expiresInSeconds: 3600,
      });

      // Persist to state and localStorage
      setUserCreds(creds);
      setApiS3(api);
      setUploadManager(manager);
      setSignedUrlUploadManager(signedUrlManager);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));

      // You can redirect somewhere after login
      if (pathname === '/' || pathname === '/login') {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Login failed', error);
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear session completely
  const clearSession = () => {
    try {
      // Set loading state to prevent components from using context values
      setIsLoading(true);

      // Clean up upload manager if it exists
      if (uploadManager) {
        try {
          // Cancel any ongoing uploads before clearing
          // Note: Implement proper cleanup based on UploadManager API
        } catch (error) {
          console.warn('Error cleaning up uploads during logout:', error);
        }
      }

      // Clear all drive store data to prevent data leakage between sessions
      clearAllData();

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      // Navigate away from authenticated routes first
      router.push('/');

      // Use setTimeout to allow navigation and component unmounting to complete
      setTimeout(() => {
        setUserCreds(null);
        setApiS3(null);
        setUploadManager(null);
        setSignedUrlUploadManager(null);
        setTimeout(() => setIsLoading(false), 50);
      }, 100);
    } catch (error) {
      console.error('Error clearing session:', error);
      setTimeout(() => {
        setUserCreds(null);
        setApiS3(null);
        setUploadManager(null);
        setSignedUrlUploadManager(null);
        setIsLoading(false);
        clearAllData();
      }, 50);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        apiS3,
        uploadManager,
        signedUrlUploadManager,
        userCreds,
        isLoading,
        createSession,
        clearSession,
      }}
    >
      {isLoading ? (
        <div className="flex h-screen items-center justify-center">
          <p>Loading...</p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
