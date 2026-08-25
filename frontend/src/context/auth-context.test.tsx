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

/**
 * The route the provider believes it is on. Mutable because restoring a
 * session behaves differently per route, and a fixed '/dashboard' hid that:
 * the redirect this used to perform could never fire under test.
 */
const route = vi.hoisted(() => ({ current: '/dashboard' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => route.current,
}));

/**
 * The one listing `createSession` makes to prove the credentials work, exposed
 * so a test can decide whether the bucket accepts it. Defaults to accepting,
 * which is what every test here other than the connection ones assumes.
 */
const s3 = vi.hoisted(() => ({
  fetchDirectoryStructure: vi.fn(async (_prefix: string, _maxKeys?: number) => ({
    files: [] as unknown[],
    folders: [] as unknown[],
  })),
}));

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {
    getS3Client() {
      return {};
    }
    getBucketName() {
      return 'test-bucket';
    }
    fetchDirectoryStructure(prefix: string, maxKeys?: number) {
      return s3.fetchDirectoryStructure(prefix, maxKeys);
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
 * Waits out the gate timer clearSession uses to defer lifting `isLoading` until
 * navigation has unmounted the authenticated routes. Without this the timer
 * fires into an already torn down environment once the whole suite runs
 * together, which surfaces as an unhandled error rather than a failure.
 */
async function settleLogout() {
  // Not wrapped in act(): waitFor already does that, and nesting the two stops
  // the timer ever being advanced. The controls coming back means isLoading
  // has flipped false again, which is the last of the deferred updates.
  await waitFor(() => expect(screen.getByText('logout')).toBeDefined());
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

/**
 * Constructing a provider touches no network, so before this any credentials
 * at all "connected" successfully. The failure surfaced later, on the
 * dashboard's first listing, a page away from the form that could fix it.
 */
describe('credentials are proved before a session is built on them', () => {
  function ConnectOnly() {
    const { createSession } = useContext(AuthContext);
    return (
      <button
        onClick={() =>
          void createSession({
            accessKeyId: 'AKIA_B',
            secretAccessKey: 'secret-b',
            region: 'us-east-1',
            bucketName: 'b',
            prefix: '',
          } as never).catch(() => {})
        }
      >
        connect
      </button>
    );
  }

  /** Same wait as renderProvider: children are a placeholder until restore settles. */
  async function renderConnect() {
    render(
      <AuthProvider>
        <ConnectOnly />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('connect')).toBeDefined());
  }

  beforeEach(() => {
    localStorage.clear();
    s3.fetchDirectoryStructure.mockReset();
    s3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });
  });

  it('lists once against the bucket before persisting anything', async () => {
    const listed = s3.fetchDirectoryStructure;

    await renderConnect();

    await act(async () => {
      screen.getByText('connect').click();
    });

    await waitFor(() => expect(listed).toHaveBeenCalled());
    // One object is enough to prove the call is allowed, and a bucket with a
    // million keys should not pay for a full page to find that out.
    expect(listed.mock.calls[0]?.[1]).toBe(1);
  });

  it('does not persist credentials the bucket rejected', async () => {
    const denied = Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    s3.fetchDirectoryStructure.mockRejectedValue(denied);

    await renderConnect();

    await act(async () => {
      screen.getByText('connect').click();
    });

    // A stored session that cannot list is a dashboard that cannot load, and
    // the user is no longer on the page that could fix it.
    await waitFor(() => expect(localStorage.getItem('s3_user_session')).toBeNull());
  });
});

/**
 * Restoring a session is not a reason to navigate.
 *
 * The provider used to push to /dashboard whenever it found stored credentials
 * while the user sat on `/`, `/connect` or a provider page. All three are pages
 * with something to read - the landing page is the pitch, and the connect pages
 * exist to be found in search - so a returning visitor was bounced off the
 * exact page they had arrived at, and someone with one bucket connected could
 * not reach the form to add a second.
 *
 * It also read far more into the signal than was there: there is no account
 * here, so "has a session" means only that keys are in this browser's
 * localStorage, which a shared machine satisfies just as well as present
 * intent.
 *
 * These pin the absence of that redirect. The old `usePathname` mock returned
 * '/dashboard' unconditionally, so the behaviour was never covered either way.
 */
describe('restoring a session does not navigate', () => {
  const storedCreds = JSON.stringify({
    accessKeyId: 'AKIA_A',
    secretAccessKey: 'secret-a',
    region: 'us-east-1',
  });

  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
    route.current = '/dashboard';
  });

  it.each(['/', '/connect', '/connect/cloudflare-r2'])(
    'leaves a signed-in visitor on %s',
    async (pathname) => {
      route.current = pathname;
      localStorage.setItem(STORAGE_KEY, storedCreds);

      await renderProvider();

      expect(pushMock).not.toHaveBeenCalled();
    }
  );

  it('still restores the session it found', async () => {
    route.current = '/connect';
    localStorage.setItem(STORAGE_KEY, storedCreds);

    await renderProvider();

    // Not navigating is only correct if the session is genuinely live: the
    // "Go to Dashboard" control on these pages renders off exactly this.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedCreds);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not navigate when there is no session to restore', async () => {
    route.current = '/';

    await renderProvider();

    expect(pushMock).not.toHaveBeenCalled();
  });
});

/**
 * Public pages render before a session has been looked for.
 *
 * `isLoading` starts true, so the placeholder is what the server renders for
 * any route not on the public list - the page's entire body is the word
 * "Loading...", which is also what a crawler indexes. `/privacy`, `/terms` and
 * `/connect` were on the list for that reason; the landing page, which is the
 * whole pitch, was not.
 */
describe('public routes render without waiting for the session', () => {
  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
    route.current = '/dashboard';
  });

  it.each(['/', '/privacy', '/terms', '/connect', '/connect/cloudflare-r2'])(
    'renders %s straight away',
    (pathname) => {
      route.current = pathname;

      render(
        <AuthProvider>
          <SessionControls />
        </AuthProvider>
      );

      // No waitFor: the point is that this is in the very first render.
      expect(screen.getByText('logout')).toBeDefined();
      expect(screen.queryByText('Loading...')).toBeNull();
    }
  );

  // A stored session is what makes the restore genuinely asynchronous: with
  // nothing to restore it resolves before the first render returns, and the
  // placeholder never appears on any route.
  const storedCreds = JSON.stringify({
    accessKeyId: 'AKIA_A',
    secretAccessKey: 'secret-a',
    region: 'us-east-1',
  });

  it.each(['/dashboard', '/dashboard/browse'])('still gates %s behind the restore', (pathname) => {
    // '/' would match every route if the child test treated it as a bare
    // prefix. It looks for a '/' after the route, and nothing begins with '//'.
    route.current = pathname;
    localStorage.setItem(STORAGE_KEY, storedCreds);

    render(
      <AuthProvider>
        <SessionControls />
      </AuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders / straight away even with a session to restore', () => {
    route.current = '/';
    localStorage.setItem(STORAGE_KEY, storedCreds);

    render(
      <AuthProvider>
        <SessionControls />
      </AuthProvider>
    );

    expect(screen.getByText('logout')).toBeDefined();
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});

/**
 * Establishing a session is not a reason to navigate either.
 *
 * `createSession` used to push to /dashboard from `/` or `/login`. Its only
 * caller is ConnectWizard, which lives at /connect/[provider] and navigates
 * itself once this resolves - so the branch could never fire, and `/login` is
 * not a route at all.
 */
describe('createSession does not navigate', () => {
  beforeEach(() => {
    pushMock.mockClear();
    localStorage.clear();
    route.current = '/connect/cloudflare-r2';
    s3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });
  });

  it.each(['/', '/login', '/connect/cloudflare-r2'])(
    'leaves navigation to the caller from %s',
    async (pathname) => {
      route.current = pathname;
      await renderProvider();

      await act(async () => {
        screen.getByText('connect').click();
      });

      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      expect(pushMock).not.toHaveBeenCalled();
    }
  );
});
