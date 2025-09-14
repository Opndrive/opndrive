'use client';

import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BYOS3ApiProvider, Credentials } from '@opndrive/s3-api';

interface AuthContextType {
  apiS3: BYOS3ApiProvider | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userCreds, setUserCreds] = useState<Credentials | null>(null);
  const [apiS3, setApiS3] = useState<BYOS3ApiProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

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

      // Persist to state and localStorage
      setUserCreds(creds);
      setApiS3(api);
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
      localStorage.removeItem(STORAGE_KEY);
      setUserCreds(null);

      router.push('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  return (
    <AuthContext.Provider value={{ apiS3, userCreds, isLoading, createSession, clearSession }}>
      {isLoading ? (
        <div className="flex h-screen items-center justify-center">
          <p>Loading...</p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
