'use client';

import type React from 'react';
import { createContext, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  BYOS3ApiProvider,
  Credentials,
  UploadManager,
  SignedUrlUploadManager,
} from '@opndrive/s3-api';
import { useDriveStore } from './data-context';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';

/**
 * How many files upload at once.
 *
 * Owned by the s3-api managers, which is why nothing downstream keeps a pool.
 * Three is a compromise: enough to keep a connection busy through the latency
 * of small files, few enough that a browser's per-host connection budget still
 * leaves room for listings and previews.
 */
const UPLOAD_CONCURRENCY = 3;

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

/**
 * UploadManager.getInstance()/SignedUrlUploadManager.getInstance() return the
 * first instance ever built and silently discard the config passed to every
 * later call. Left unchecked, switching accounts or buckets keeps uploading
 * to whichever bucket was connected first.
 *
 * @opndrive/s3-api 2.6.0 adds a disposeInstance() static that cancels
 * in-flight uploads and clears the singleton so the next getInstance() call
 * builds fresh. The installed 2.5.0 does not have it yet, so this is called
 * through a feature-detecting cast rather than a direct reference - once
 * frontend/package.json depends on ^2.6.0, delete the cast and call
 * `UploadManager.disposeInstance()` / `SignedUrlUploadManager.disposeInstance()`
 * directly.
 */
type Disposable = { disposeInstance?: () => Promise<void> };

let warnedAboutLegacyUploadManager = false;

async function disposeUploadManagers(): Promise<void> {
  const managerCtor = UploadManager as unknown as Disposable;
  const signedCtor = SignedUrlUploadManager as unknown as Disposable;

  if (!managerCtor.disposeInstance || !signedCtor.disposeInstance) {
    if (!warnedAboutLegacyUploadManager) {
      warnedAboutLegacyUploadManager = true;
      console.warn(
        '[opndrive] The installed @opndrive/s3-api predates 2.6.0, so upload ' +
          'managers cannot be disposed on session change. Switching buckets ' +
          'without a full page reload may keep uploading to the previous ' +
          'bucket. Upgrade to ^2.6.0.'
      );
    }
    return;
  }

  await Promise.all([managerCtor.disposeInstance(), signedCtor.disposeInstance()]);
}

/**
 * Disposes any existing singletons, then builds fresh managers bound to
 * `api`. Shared by both session-restore and interactive login so every path
 * that establishes a session gets the same guarantee.
 */
async function initializeUploadManagers(
  api: BYOS3ApiProvider,
  creds: Credentials
): Promise<{ manager: UploadManager; signedUrlManager: SignedUrlUploadManager }> {
  await disposeUploadManagers();

  // Establishing a session must not inherit a previous one's search results.
  // clearSession() already does this, but /connect is reachable client-side
  // without logging out first, so a session can start without one ever having
  // been cleared. Same belt-and-braces reasoning as disposing the upload
  // managers on both edges rather than only on logout.
  useSearchStore.getState().clearCache();

  // This is the ONE place upload concurrency is set. The executor deliberately
  // has no pool of its own - two components each believing they control how
  // many uploads are in flight is how "3 at a time" becomes six.
  const manager = UploadManager.getInstance({
    s3: api.getS3Client(),
    bucket: api.getBucketName(),
    prefix: creds.prefix || '',
    maxConcurrency: UPLOAD_CONCURRENCY,
    partSizeMB: 5,
  });

  const signedUrlManager = SignedUrlUploadManager.getInstance({
    apiProvider: api,
    maxConcurrency: UPLOAD_CONCURRENCY,
    expiresInSeconds: 3600,
  });

  return { manager, signedUrlManager };
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

/**
 * How long logout keeps the loading placeholder up before letting children
 * render again.
 *
 * It exists to give `router.push('/')` time to commit, so the dashboard is not
 * briefly re-rendered without a session behind it. Matches the 100ms + 50ms the
 * two nested timers used to add up to.
 */
const LOGOUT_GATE_MS = 150;

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

  /**
   * The one timer logout still needs, held so it can be cancelled.
   *
   * Logout used to defer its work behind two nested uncancelled timers. Nothing
   * stopped them, so they fired into whatever was left of the tree: harmless in
   * the browser, where this provider only unmounts with the page, but in tests
   * they land after the DOM has gone and throw `window is not defined`.
   */
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (gateTimer.current !== null) clearTimeout(gateTimer.current);
    };
  }, []);

  const clearSessionState = () => {
    setUserCreds(null);
    setApiS3(null);
    setUploadManager(null);
    setSignedUrlUploadManager(null);
  };

  /** Lets children render again once the route change has had time to commit. */
  const releaseLoadingGate = () => {
    if (gateTimer.current !== null) clearTimeout(gateTimer.current);

    gateTimer.current = setTimeout(() => {
      gateTimer.current = null;
      setIsLoading(false);
    }, LOGOUT_GATE_MS);
  };

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

            const { manager, signedUrlManager } = await initializeUploadManagers(api, creds);

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
    // Mount-only on purpose. This restores a persisted session exactly once
    // per app load; including `pathname`/`router` would re-run the whole
    // restore on every client-side navigation, and including `clearSession`
    // would re-run it whenever the provider re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create a session & persist in localStorage
  const createSession = async (creds: Credentials): Promise<void> => {
    try {
      setIsLoading(true);
      const api = new BYOS3ApiProvider(creds, 'BYO');

      const { manager, signedUrlManager } = await initializeUploadManagers(api, creds);

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

      // Dispose the upload manager singletons so a new session cannot resume
      // uploading to this bucket. disposeUploadManagers() never throws, and
      // it clears the static singleton reference synchronously before doing
      // any awaiting, so it is safe to fire-and-forget here rather than
      // block logout on in-flight cancellation network calls.
      void disposeUploadManagers().catch((error) => {
        console.warn('Error cleaning up uploads during logout:', error);
      });

      // Clear all drive store data to prevent data leakage between sessions
      clearAllData();

      // Same for upload/delete history. Disposal above emits a 'cancelled'
      // event per in-flight item, and those land in the upload store before
      // UploadProvider unmounts - without this, records from this bucket would
      // still be on screen after connecting to a different one.
      useUploadStore.getState().clearSessionData();

      // And the search cache, which holds raw object keys from this bucket.
      // It is keyed by query+prefix with a 5 minute TTL and nothing else
      // clears it, so without this a repeat search after switching accounts
      // is served the previous account's file and folder names straight out
      // of memory.
      useSearchStore.getState().clearCache();

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      // Navigate away from authenticated routes first
      router.push('/');

      // Cleared straight away rather than behind a timer. `setIsLoading(true)`
      // above lands in this same update, so the placeholder has already taken
      // the place of every child and there is nobody left to read a half
      // cleared session. Only lifting the gate has to wait.
      clearSessionState();
      releaseLoadingGate();
    } catch (error) {
      console.error('Error clearing session:', error);
      clearSessionState();
      clearAllData();
      releaseLoadingGate();
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
