import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useContext } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthContext, AuthProvider } from './auth-context';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
import type { SearchResult } from '@opndrive/s3-api';

/**
 * Regression test for the search cache surviving a session change.
 *
 * The search store is module-level, so it outlives every component - but a
 * bucket switch happens entirely client-side with no reload. clearSession()
 * cleared the drive store and the upload store and left this one untouched,
 * so repeating a search after switching accounts was served the previous
 * account's object keys straight out of the 5 minute TTL cache.
 *
 * This mounts the real AuthProvider rather than asserting on the store in
 * isolation. A store-only test would pass with or without the fix, since
 * clearCache() already existed and worked - the defect was that nothing in
 * the session lifecycle ever called it.
 */

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard',
}));

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {
    getS3Client() {
      return {};
    }
    getBucketName() {
      return 'test-bucket';
    }
  },
  UploadManager: {
    getInstance: () => ({}),
    disposeInstance: async () => {},
  },
  SignedUrlUploadManager: {
    getInstance: () => ({}),
    disposeInstance: async () => {},
  },
}));

const bucketAResults: SearchResult = {
  files: [{ Key: 'private/bucket-a/salaries.xlsx' } as never],
  folders: [{ Key: 'private/bucket-a/' } as never],
  totalFiles: 1,
  totalFolders: 1,
  totalKeys: 2,
  isTruncated: false,
};

function SessionControls() {
  const { clearSession, createSession } = useContext(AuthContext);
  return (
    <div>
      <button onClick={() => clearSession()}>logout</button>
      <button
        onClick={() =>
          void createSession({
            accessKeyId: 'AKIA_B',
            secretAccessKey: 'secret-b',
            region: 'us-east-1',
          } as never)
        }
      >
        connect
      </button>
    </div>
  );
}

/** Mirrors the key AuthProvider persists the session under. */
const STORAGE_KEY = 's3_user_session';

async function renderProvider() {
  const result = render(
    <AuthProvider>
      <SessionControls />
    </AuthProvider>
  );
  // AuthProvider swaps children for a placeholder until its restore pass
  // settles, so wait for the controls to actually exist.
  await waitFor(() => expect(screen.getByText('logout')).toBeDefined());
  return result;
}

/**
 * Logout used to defer its work behind two nested timers that nothing
 * cancelled. They fired into whatever was left of the tree - harmless in a
 * browser, where this provider only unmounts with the page, but in tests they
 * landed after the DOM had gone and threw `window is not defined`, which showed
 * up as an unhandled error attributed to whichever file was unlucky.
 *
 * The session is cleared synchronously now, because `setIsLoading(true)` has
 * already swapped every child for the placeholder in the same update. Only
 * lifting that gate is still deferred, and that timer is cancelled on unmount.
 */
describe('logout leaves no timer running', () => {
  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
  });

  it('clears the session without waiting for a timer', async () => {
    await renderProvider();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessKeyId: 'a' }));

    await act(async () => {
      screen.getByText('logout').click();
    });

    // Everything except the gate is done by the time the click returns.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(pushMock).toHaveBeenCalledWith('/');
    // Children stay behind the placeholder until the route change commits.
    expect(screen.queryByText('logout')).toBeNull();
  });

  it('cancels the pending timer if the provider unmounts first', async () => {
    const { unmount } = await renderProvider();

    vi.useFakeTimers();
    try {
      act(() => {
        screen.getByText('logout').click();
      });

      // Exactly one timer: the gate. It used to be two, nested.
      expect(vi.getTimerCount()).toBe(1);

      unmount();

      // Left pending, this is the one that fires into a torn down environment.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lifts the gate once the wait is over', async () => {
    await renderProvider();

    await act(async () => {
      screen.getByText('logout').click();
    });
    expect(screen.queryByText('logout')).toBeNull();

    await waitFor(() => expect(screen.getByText('logout')).toBeDefined());
  });
});

describe('session changes must not leak the search cache', () => {
  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
    useSearchStore.getState().clearCache();
    useSearchStore.getState().setLoading(false);
  });

  it('clears cached search results on logout', async () => {
    await renderProvider();

    useSearchStore.getState().setSearchResults('payroll', '', bucketAResults);
    useSearchStore.getState().setCurrentQuery('payroll', '');
    // Precondition: the cache really does answer a repeat query. If this stops
    // holding, the leak stops existing and so does the need for the fix.
    expect(useSearchStore.getState().getCachedOrNull('payroll', '')).not.toBeNull();

    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(useSearchStore.getState().getCachedOrNull('payroll', '')).toBeNull();
    expect(useSearchStore.getState().searchCache.size).toBe(0);
    expect(useSearchStore.getState().currentQuery).toBeNull();
  });

  it('clears cached search results when a new session starts', async () => {
    await renderProvider();

    useSearchStore.getState().setSearchResults('payroll', '', bucketAResults);
    expect(useSearchStore.getState().getCachedOrNull('payroll', '')).not.toBeNull();

    // /connect is reachable client-side without logging out first, so a
    // session can begin without clearSession ever having run.
    await act(async () => {
      screen.getByText('connect').click();
    });

    await waitFor(() =>
      expect(useSearchStore.getState().getCachedOrNull('payroll', '')).toBeNull()
    );
    expect(useSearchStore.getState().searchCache.size).toBe(0);
  });
});
