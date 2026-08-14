import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useContext } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthContext, AuthProvider } from './auth-context';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
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

async function renderProvider() {
  render(
    <AuthProvider>
      <SessionControls />
    </AuthProvider>
  );
  // AuthProvider swaps children for a placeholder until its restore pass
  // settles, so wait for the controls to actually exist.
  await waitFor(() => expect(screen.getByText('logout')).toBeDefined());
}

/**
 * Waits out the nested timers clearSession uses to defer nulling the provider
 * until navigation has unmounted the authenticated routes. Without this the
 * timers fire into an already torn down environment once the whole suite runs
 * together, which surfaces as an unhandled error rather than a failure.
 */
async function settleLogout() {
  // Not wrapped in act(): waitFor already does that, and nesting the two stops
  // the timers ever being advanced. The controls coming back means isLoading
  // has flipped false again, which is the last of the deferred updates.
  await waitFor(() => expect(screen.getByText('logout')).toBeDefined());
}

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

    await settleLogout();
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

/**
 * Regression test for a delete outliving the session that authorised it.
 *
 * A folder delete walks its keys in a loop holding the apiS3 it started with,
 * so clearSession() nulling the provider does not reach it - it kept deleting
 * with the credentials of the account the user had just signed out of. The
 * abort signal is the only thing the loop checks, so logout has to trip it.
 *
 * Mounting the real AuthProvider is the point. Asserting on the store alone
 * would pass whether or not clearSession ever calls abortAllDeleteOperations,
 * and that call being absent is exactly what the bug was.
 */
describe('logout must stop deletes it authorised', () => {
  const deletion = (id: string, status: 'queued' | 'deleting' | 'completed') => ({
    id,
    name: `${id}.pdf`,
    status,
    progress: 0,
    type: 'file' as const,
  });

  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
  });

  it('aborts a delete that is still running', async () => {
    await renderProvider();

    const signal = useUploadStore.getState().startDeleteOperation('d1', deletion('d1', 'deleting'));
    expect(signal.aborted).toBe(false);

    await act(async () => {
      screen.getByText('logout').click();
    });

    // Without this the loop runs to completion against the previous session's
    // client, deleting objects nobody is authorised for any more.
    expect(signal.aborted).toBe(true);

    await settleLogout();
  });

  it('aborts before the delete history is wiped', async () => {
    await renderProvider();

    const signal = useUploadStore.getState().startDeleteOperation('d1', deletion('d1', 'queued'));

    await act(async () => {
      screen.getByText('logout').click();
    });

    // `deletes` holds the only reference to each controller. Clearing it first
    // would strand the loop with nothing left that could stop it, so both have
    // to be true at the end: aborted, and gone.
    expect(signal.aborted).toBe(true);
    expect(useUploadStore.getState().deletes).toEqual({});

    await settleLogout();
  });

  it('leaves a delete that already finished alone', async () => {
    await renderProvider();

    const signal = useUploadStore
      .getState()
      .startDeleteOperation('d1', deletion('d1', 'completed'));

    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(signal.aborted).toBe(false);

    await settleLogout();
  });

  it('aborts when a new session starts without a logout first', async () => {
    await renderProvider();

    const signal = useUploadStore.getState().startDeleteOperation('d1', deletion('d1', 'deleting'));

    // /connect is reachable client-side without logging out, so a delete
    // authorised for the previous bucket would otherwise keep running against
    // it while the UI already shows the new one.
    await act(async () => {
      screen.getByText('connect').click();
    });

    await waitFor(() => expect(signal.aborted).toBe(true));
  });
});
