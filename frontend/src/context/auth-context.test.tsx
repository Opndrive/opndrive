import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useContext, type ContextType } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthContext, AuthProvider } from './auth-context';
import { useDriveStore } from './data-context';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import type { Credentials, SearchResult } from '@opndrive/s3-api';

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

/**
 * What the s3-api mock recorded.
 *
 * A bucket switch is only correct if it builds a *new* provider, so the
 * credentials each one was constructed from are kept, and `setBucketName` -
 * the in-place path a switch must never take - is a spy that should stay
 * untouched.
 */
const api = vi.hoisted(() => ({
  /** Credentials of every provider constructed, in order. */
  created: [] as Record<string, unknown>[],
  /** Made to throw once from the provider constructor, the way a bad endpoint would. */
  constructorError: null as Error | null,
  setBucketName: vi.fn(),
  disposeUploadManager: vi.fn(async () => {}),
  disposeSignedUrlManager: vi.fn(async () => {}),
  uploadManagers: 0,
  signedUrlManagers: 0,
}));

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {
    creds: Record<string, unknown>;

    constructor(creds: Record<string, unknown>) {
      if (api.constructorError) {
        const error = api.constructorError;
        api.constructorError = null;
        throw error;
      }
      this.creds = creds;
      api.created.push(creds);
    }
    getS3Client() {
      return {};
    }
    getBucketName() {
      return (this.creds?.bucketName as string) ?? 'test-bucket';
    }
    getPrefix() {
      return (this.creds?.prefix as string) ?? '';
    }
    setBucketName(bucketName: string) {
      api.setBucketName(bucketName);
    }
    fetchDirectoryStructure(prefix: string, maxKeys?: number) {
      return s3.fetchDirectoryStructure(prefix, maxKeys);
    }
  },
  // Fresh objects per call, so "the managers were rebuilt" is an identity
  // check rather than an act of faith.
  UploadManager: {
    getInstance: () => ({ id: `upload-${++api.uploadManagers}` }),
    disposeInstance: api.disposeUploadManager,
  },
  SignedUrlUploadManager: {
    getInstance: () => ({ id: `signed-${++api.signedUrlManagers}` }),
    disposeInstance: api.disposeSignedUrlManager,
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

/**
 * Switching bucket is a new session on the same keys, not a rename.
 *
 * The provider exposes `setBucketName`, and reaching for it is the obvious
 * mistake: it keeps the same object identity, and identity is what every
 * bucket-scoped thing downstream watches to know its world has changed. The
 * search service is memoised on it, the download store keys off it, the upload
 * executor compares against it. Renaming the bucket underneath them leaves all
 * three serving bucket A while the app says bucket B.
 *
 * The second half of the contract is order. Everything that proves the new
 * bucket happens before anything that destroys the old one, so a bucket that
 * turns out not to exist costs the user nothing.
 */
describe('switching bucket rebuilds the session around a new provider', () => {
  const BUCKET_A: Credentials = {
    accessKeyId: 'AKIA_A',
    secretAccessKey: 'secret-a',
    region: 'us-east-1',
    bucketName: 'bucket-a',
    prefix: 'foo/bar/',
    endpoint: 'https://s3.example.com',
  };

  let auth: ContextType<typeof AuthContext> | null = null;

  function AuthProbe() {
    auth = useContext(AuthContext);
    return <div>ready</div>;
  }

  /**
   * Restores a session on bucket-a and hands back what it started with, so a
   * test can assert against the identities the switch is supposed to replace.
   *
   * The restore builds managers of its own, which means it also disposes the
   * previous ones - those calls are cleared here so the disposal a switch does
   * is the only one on record.
   */
  async function renderSessionOnBucketA() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(BUCKET_A));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeDefined());

    const before = {
      apiS3: auth?.apiS3,
      uploadManager: auth?.uploadManager,
      signedUrlUploadManager: auth?.signedUrlUploadManager,
      providers: api.created.length,
    };

    api.disposeUploadManager.mockClear();
    api.disposeSignedUrlManager.mockClear();
    s3.fetchDirectoryStructure.mockClear();
    pushMock.mockClear();

    return before;
  }

  /** The credentials the most recently constructed provider was built from. */
  function lastCandidate() {
    return api.created[api.created.length - 1];
  }

  beforeEach(() => {
    auth = null;
    route.current = '/dashboard';
    pushMock.mockClear();
    localStorage.clear();

    api.created.length = 0;
    api.setBucketName.mockClear();
    api.disposeUploadManager.mockClear();
    api.disposeSignedUrlManager.mockClear();

    s3.fetchDirectoryStructure.mockReset();
    s3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });

    useSearchStore.getState().clearCache();
    useSearchStore.getState().setLoading(false);
    useUploadStore.getState().clearSessionData();
    useDriveStore.getState().clearAllData();
  });

  it('keeps the keys and endpoint, takes the new bucket and region', async () => {
    await renderSessionOnBucketA();

    await act(async () => {
      await auth!.switchBucket('bucket-b', 'eu-west-1');
    });

    expect(lastCandidate()).toEqual({
      accessKeyId: 'AKIA_A',
      secretAccessKey: 'secret-a',
      endpoint: 'https://s3.example.com',
      bucketName: 'bucket-b',
      region: 'eu-west-1',
      prefix: '',
    });
    // The credentials it was handed are not the credentials it edited.
    expect(BUCKET_A.bucketName).toBe('bucket-a');
    expect(BUCKET_A.prefix).toBe('foo/bar/');
  });

  it('drops the old prefix rather than carrying it into the new bucket', async () => {
    await renderSessionOnBucketA();

    await act(async () => {
      await auth!.switchBucket('bucket-b');
    });

    // 'foo/bar/' names a folder in bucket-a. Asked of bucket-b it lists empty,
    // which reads as "this bucket is empty" rather than "wrong place".
    expect(lastCandidate().prefix).toBe('');
    expect(auth?.userCreds?.prefix).toBe('');
    // And the verification listing went to the root, not the old folder.
    expect(s3.fetchDirectoryStructure).toHaveBeenCalledWith('', 1);
  });

  it('stays in the current region when none is supplied', async () => {
    await renderSessionOnBucketA();

    await act(async () => {
      await auth!.switchBucket('bucket-b');
    });

    expect(lastCandidate().region).toBe('us-east-1');
  });

  it('builds a new provider instead of renaming the current one', async () => {
    const before = await renderSessionOnBucketA();

    await act(async () => {
      await auth!.switchBucket('bucket-b', 'eu-west-1');
    });

    // The whole reason this is not `apiS3.setBucketName('bucket-b')`.
    expect(api.setBucketName).not.toHaveBeenCalled();
    expect(api.created.length).toBe(before.providers + 1);
    // Consumers memoise on this identity; an unchanged one is a stale search
    // service and a stale download store.
    expect(auth?.apiS3).not.toBe(before.apiS3);
    expect(auth?.apiS3?.getBucketName()).toBe('bucket-b');
  });

  it('proves the new bucket before anything of the old one is torn down', async () => {
    const seen: { disposed?: boolean; cached?: number } = {};

    await renderSessionOnBucketA();

    useSearchStore.getState().setSearchResults('payroll', '', bucketAResults);
    useDriveStore.getState().setPrefixData('foo/bar/', {
      files: [],
      folders: [],
      isTruncated: false,
    });

    s3.fetchDirectoryStructure.mockImplementation(async () => {
      seen.disposed = api.disposeUploadManager.mock.calls.length > 0;
      seen.cached = Object.keys(useDriveStore.getState().cache).length;
      return { files: [], folders: [] };
    });

    await act(async () => {
      await auth!.switchBucket('bucket-b');
    });

    // Verification happens while the old session is still whole. If either of
    // these has already moved, a bucket that fails to verify has cost the user
    // their upload managers and their caches for nothing.
    expect(seen.disposed).toBe(false);
    expect(seen.cached).toBe(1);
  });

  it('disposes both managers and rebuilds them', async () => {
    const before = await renderSessionOnBucketA();

    await act(async () => {
      await auth!.switchBucket('bucket-b');
    });

    // getInstance() hands back the first instance ever built and ignores the
    // config, so without disposal the new session keeps uploading to bucket-a.
    expect(api.disposeUploadManager).toHaveBeenCalledTimes(1);
    expect(api.disposeSignedUrlManager).toHaveBeenCalledTimes(1);
    expect(auth?.uploadManager).not.toBe(before.uploadManager);
    expect(auth?.signedUrlUploadManager).not.toBe(before.signedUrlUploadManager);
  });

  it('clears every cache that still describes the old bucket', async () => {
    await renderSessionOnBucketA();

    useSearchStore.getState().setSearchResults('payroll', '', bucketAResults);
    useDriveStore.getState().setPrefixData('foo/bar/', {
      files: [],
      folders: [],
      isTruncated: false,
    });
    useDriveStore.getState().setRootPrefix('foo/bar/');

    await act(async () => {
      await auth!.switchBucket('bucket-b');
    });

    // Both hold object keys from bucket-a. Left behind, the dashboard shows
    // bucket-a's files under bucket-b's name until something refetches.
    expect(useSearchStore.getState().getCachedOrNull('payroll', '')).toBeNull();
    expect(useDriveStore.getState().cache).toEqual({});
    expect(useDriveStore.getState().rootPrefix).toBeNull();
  });

  it('aborts deletes authorised against the old bucket', async () => {
    await renderSessionOnBucketA();

    const signal = useUploadStore.getState().startDeleteOperation('d1', {
      id: 'd1',
      name: 'd1.pdf',
      status: 'deleting',
      progress: 0,
      type: 'file',
    });

    await act(async () => {
      await auth!.switchBucket('bucket-b', undefined, { discardActiveWork: true });
    });

    // The loop holds the old provider in a closure, so the signal is the only
    // thing that can stop it deleting from bucket-a.
    expect(signal.aborted).toBe(true);
  });

  it('persists the new session and lands at the dashboard root', async () => {
    await renderSessionOnBucketA();

    const result = await act(async () => auth!.switchBucket('bucket-b', 'eu-west-1'));

    expect(result).toEqual({ status: 'switched', bucketName: 'bucket-b' });
    expect(auth?.userCreds?.bucketName).toBe('bucket-b');
    expect(auth?.userCreds?.region).toBe('eu-west-1');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      accessKeyId: 'AKIA_A',
      secretAccessKey: 'secret-a',
      endpoint: 'https://s3.example.com',
      bucketName: 'bucket-b',
      region: 'eu-west-1',
      prefix: '',
    });
    // /dashboard/browse carries a prefix in its URL, and that prefix belongs
    // to a bucket the session has just left.
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('does nothing when the bucket picked is the one already open', async () => {
    const before = await renderSessionOnBucketA();

    const result = await act(async () => auth!.switchBucket('bucket-a'));

    // A dropdown makes re-picking the current bucket easy, and answering that
    // with a teardown would cancel every upload in flight for nothing.
    expect(result).toEqual({ status: 'unchanged', bucketName: 'bucket-a' });
    expect(api.created.length).toBe(before.providers);
    expect(api.disposeUploadManager).not.toHaveBeenCalled();
    expect(auth?.apiS3).toBe(before.apiS3);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('treats a region correction on the same bucket as a real switch', async () => {
    const before = await renderSessionOnBucketA();

    await act(async () => {
      await auth!.switchBucket('bucket-a', 'eu-west-1');
    });

    // Same name, different region, so the client has to be rebuilt: the old
    // one answers with a redirect for every request.
    expect(api.created.length).toBe(before.providers + 1);
    expect(lastCandidate().region).toBe('eu-west-1');
  });

  it('refuses when there is no session to switch', async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeDefined());

    await expect(auth!.switchBucket('bucket-b')).rejects.toThrow(/no session/);
  });

  it('refuses an empty bucket name', async () => {
    const before = await renderSessionOnBucketA();

    await expect(auth!.switchBucket('   ')).rejects.toThrow(/bucketName is required/);
    expect(api.created.length).toBe(before.providers);
  });
});

/**
 * A switch that cannot be verified must cost nothing.
 *
 * This is the half that makes the ordering worth writing down: the session
 * being replaced is a working one, so a bucket that is missing, in another
 * region, or simply not readable by these keys has to leave the user exactly
 * where they were - still on bucket-a, caches intact, uploads untouched.
 */
describe('a bucket switch that fails verification leaves the session alone', () => {
  const BUCKET_A: Credentials = {
    accessKeyId: 'AKIA_A',
    secretAccessKey: 'secret-a',
    region: 'us-east-1',
    bucketName: 'bucket-a',
    prefix: 'foo/bar/',
  };

  let auth: ContextType<typeof AuthContext> | null = null;

  function AuthProbe() {
    auth = useContext(AuthContext);
    return <div>ready</div>;
  }

  const denied = () =>
    Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });

  beforeEach(async () => {
    auth = null;
    route.current = '/dashboard';
    pushMock.mockClear();
    localStorage.clear();

    api.created.length = 0;
    api.setBucketName.mockClear();
    api.disposeUploadManager.mockClear();
    api.disposeSignedUrlManager.mockClear();

    s3.fetchDirectoryStructure.mockReset();
    s3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });

    useSearchStore.getState().clearCache();
    useSearchStore.getState().setLoading(false);
    useUploadStore.getState().clearSessionData();
    useDriveStore.getState().clearAllData();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(BUCKET_A));
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeDefined());

    api.disposeUploadManager.mockClear();
    api.disposeSignedUrlManager.mockClear();
    pushMock.mockClear();
  });

  it('reports what went wrong instead of a bare failure', async () => {
    s3.fetchDirectoryStructure.mockRejectedValue(denied());

    // Classified the same way /connect classifies it, so a caller can say
    // whether the bucket is missing, elsewhere, or just not readable.
    await expect(auth!.switchBucket('bucket-b')).rejects.toMatchObject({
      name: 'ConnectionFailureError',
      failure: { kind: 'permissions' },
    });
  });

  it('keeps the current bucket, its provider and its stored session', async () => {
    const before = auth?.apiS3;
    s3.fetchDirectoryStructure.mockRejectedValue(denied());

    await act(async () => {
      await auth!.switchBucket('bucket-b', 'eu-west-1').catch(() => {});
    });

    expect(auth?.userCreds).toEqual(BUCKET_A);
    expect(auth?.apiS3).toBe(before);
    expect(auth?.apiS3?.getBucketName()).toBe('bucket-a');
    // Storage must never claim a bucket the running app is not on: the next
    // reload would restore it.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(BUCKET_A);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('destroys none of the bucket-scoped state', async () => {
    useSearchStore.getState().setSearchResults('payroll', '', bucketAResults);
    useDriveStore.getState().setPrefixData('foo/bar/', {
      files: [],
      folders: [],
      isTruncated: false,
    });
    const signal = useUploadStore.getState().startDeleteOperation('d1', {
      id: 'd1',
      name: 'd1.pdf',
      status: 'deleting',
      progress: 0,
      type: 'file',
    });

    s3.fetchDirectoryStructure.mockRejectedValue(denied());

    await act(async () => {
      // Explicitly allowed to cancel work, so nothing here is spared by the
      // in-flight guard: what spares it is the failed verification.
      await auth!.switchBucket('bucket-b', undefined, { discardActiveWork: true }).catch(() => {});
    });

    expect(useSearchStore.getState().getCachedOrNull('payroll', '')).not.toBeNull();
    expect(Object.keys(useDriveStore.getState().cache)).toEqual(['foo/bar/']);
    expect(signal.aborted).toBe(false);
    expect(api.disposeUploadManager).not.toHaveBeenCalled();
    expect(api.disposeSignedUrlManager).not.toHaveBeenCalled();
  });
});

/**
 * Switching cancels every upload and delete in flight, so it asks first.
 *
 * Not with a dialog - that belongs to whatever UI ends up driving this. The
 * contract here is only that the switch refuses to throw away running work
 * unless it has been told it may, and that it says how much work that is.
 */
describe('a bucket switch does not discard work in flight behind the user', () => {
  const BUCKET_A: Credentials = {
    accessKeyId: 'AKIA_A',
    secretAccessKey: 'secret-a',
    region: 'us-east-1',
    bucketName: 'bucket-a',
    prefix: '',
  };

  let auth: ContextType<typeof AuthContext> | null = null;

  function AuthProbe() {
    auth = useContext(AuthContext);
    return <div>ready</div>;
  }

  beforeEach(async () => {
    auth = null;
    route.current = '/dashboard';
    pushMock.mockClear();
    localStorage.clear();

    api.created.length = 0;
    api.disposeUploadManager.mockClear();
    api.disposeSignedUrlManager.mockClear();

    s3.fetchDirectoryStructure.mockReset();
    s3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });

    useUploadStore.getState().clearSessionData();
    useSearchStore.getState().clearCache();
    useDriveStore.getState().clearAllData();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(BUCKET_A));
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeDefined());

    api.disposeUploadManager.mockClear();
    pushMock.mockClear();
  });

  it('reports what is running rather than switching', async () => {
    useUploadStore.getState().addUpload('u1', {
      id: 'u1',
      name: 'holiday.mov',
      status: 'uploading',
      progress: 12,
      type: 'file',
    });
    useUploadStore.getState().startDeleteOperation('d1', {
      id: 'd1',
      name: 'old/',
      status: 'deleting',
      progress: 0,
      type: 'folder',
    });

    const result = await act(async () => auth!.switchBucket('bucket-b'));

    // Counts, not a boolean: whoever asks the user should be able to say what
    // they are about to lose.
    expect(result).toEqual({ status: 'blocked', activeWork: { uploads: 1, deletes: 1 } });
    expect(api.disposeUploadManager).not.toHaveBeenCalled();
    expect(auth?.userCreds?.bucketName).toBe('bucket-a');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('counts a paused upload as work worth asking about', async () => {
    useUploadStore.getState().addUpload('u1', {
      id: 'u1',
      name: 'holiday.mov',
      status: 'paused',
      progress: 12,
      type: 'file',
    });

    const result = await act(async () => auth!.switchBucket('bucket-b'));

    // Disposal ends a paused upload as finally as a running one.
    expect(result).toEqual({ status: 'blocked', activeWork: { uploads: 1, deletes: 0 } });
  });

  it('ignores work that has already finished', async () => {
    useUploadStore.getState().addUpload('u1', {
      id: 'u1',
      name: 'done.txt',
      status: 'completed',
      progress: 100,
      type: 'file',
    });

    const result = await act(async () => auth!.switchBucket('bucket-b'));

    expect(result).toMatchObject({ status: 'switched' });
  });

  it('goes ahead once cancelling has been authorised', async () => {
    useUploadStore.getState().addUpload('u1', {
      id: 'u1',
      name: 'holiday.mov',
      status: 'uploading',
      progress: 12,
      type: 'file',
    });

    const result = await act(async () =>
      auth!.switchBucket('bucket-b', undefined, { discardActiveWork: true })
    );

    expect(result).toEqual({ status: 'switched', bucketName: 'bucket-b' });
    // Disposal is what actually cancels the transfer; the flag only says it
    // may.
    expect(api.disposeUploadManager).toHaveBeenCalledTimes(1);
  });
});

/**
 * The failure modes either side of the verification step.
 *
 * Acquiring the in-flight flag is the easy half; releasing it on every exit is
 * the half that breaks. A switch that throws before the flag is cleared leaves
 * the picker permanently answering "already in progress" - dead until the page
 * is reloaded - so the release is tested through the failures rather than
 * inferred from the happy path.
 */
describe('a bucket switch cleans up after itself whatever happens', () => {
  const BUCKET_A: Credentials = {
    accessKeyId: 'AKIA_A',
    secretAccessKey: 'secret-a',
    region: 'us-east-1',
    bucketName: 'bucket-a',
    prefix: '',
  };

  let auth: ContextType<typeof AuthContext> | null = null;

  function AuthProbe() {
    auth = useContext(AuthContext);
    return <div>ready</div>;
  }

  const denied = () =>
    Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });

  beforeEach(async () => {
    auth = null;
    route.current = '/dashboard';
    pushMock.mockClear();
    localStorage.clear();

    api.created.length = 0;
    api.constructorError = null;
    api.disposeUploadManager.mockClear();
    api.disposeSignedUrlManager.mockClear();

    s3.fetchDirectoryStructure.mockReset();
    s3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });

    useUploadStore.getState().clearSessionData();
    useSearchStore.getState().clearCache();
    useDriveStore.getState().clearAllData();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(BUCKET_A));
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('ready')).toBeDefined());

    api.disposeUploadManager.mockClear();
    pushMock.mockClear();
  });

  it('refuses a second switch while the first is still verifying', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    s3.fetchDirectoryStructure.mockImplementation(async () => {
      await held;
      return { files: [], folders: [] };
    });

    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;

    await act(async () => {
      first = auth!.switchBucket('bucket-b');
      second = await auth!.switchBucket('bucket-c').catch((error: unknown) => error);
      release();
      await first;
    });

    expect(second).toBeInstanceOf(Error);
    expect((second as Error).message).toMatch(/already in progress/);
    // The loser never got as far as building anything: no provider, no
    // teardown, nothing of bucket-c anywhere.
    expect(api.created.some((creds) => creds.bucketName === 'bucket-c')).toBe(false);
    expect(api.disposeUploadManager).toHaveBeenCalledTimes(1);
    // One winner, and it is the same one in memory and in storage.
    expect(auth?.userCreds?.bucketName).toBe('bucket-b');
    expect(auth?.apiS3?.getBucketName()).toBe('bucket-b');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').bucketName).toBe('bucket-b');
  });

  it('can still switch after one that failed verification', async () => {
    s3.fetchDirectoryStructure.mockRejectedValueOnce(denied());

    await expect(auth!.switchBucket('bucket-b')).rejects.toThrow();

    // The flag is released on the way out of the failure, not only on success.
    // Left set, every later switch would answer "already in progress" for the
    // life of the page.
    const result = await act(async () => auth!.switchBucket('bucket-c'));

    expect(result).toEqual({ status: 'switched', bucketName: 'bucket-c' });
    expect(auth?.userCreds?.bucketName).toBe('bucket-c');
  });

  it('does not hold the loading gate up after a failed switch', async () => {
    s3.fetchDirectoryStructure.mockRejectedValueOnce(denied());

    await act(async () => {
      await auth!.switchBucket('bucket-b').catch(() => {});
    });

    // A switch that never got as far as tearing anything down must not have
    // raised the gate either: the dashboard is still bucket-a's and still has
    // to render.
    expect(auth?.isLoading).toBe(false);
    expect(screen.getByText('ready')).toBeDefined();
  });

  it('reports a switch that happened but could not be saved', async () => {
    const original = localStorage.setItem.bind(localStorage);
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation((key: string, value: string) => {
        // Only the session key, so the stores that persist their own state are
        // not dragged into this.
        if (key === STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError');
        original(key, value);
      });

    try {
      const result = await act(async () => auth!.switchBucket('bucket-b'));

      // The managers are rebuilt and the dashboard is on bucket-b: calling
      // that a failed switch would be untrue. The cost is a reload landing
      // back on bucket-a, which is what the warning says.
      expect(result).toEqual({ status: 'switched', bucketName: 'bucket-b' });
      expect(auth?.userCreds?.bucketName).toBe('bucket-b');
      expect(auth?.apiS3?.getBucketName()).toBe('bucket-b');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').bucketName).toBe('bucket-a');
    } finally {
      setItem.mockRestore();
    }
  });

  it('releases the flag when building the provider itself throws', async () => {
    // The S3 client is constructed from the candidate's region and endpoint,
    // which is the one step between taking the in-flight flag and the block
    // that releases it. A throw here used to escape past the release and jam
    // every later switch with "already in progress" until a reload.
    api.constructorError = new Error('Invalid endpoint URL');

    await expect(auth!.switchBucket('bucket-b')).rejects.toThrow(/Invalid endpoint/);

    const result = await act(async () => auth!.switchBucket('bucket-c'));

    expect(result).toEqual({ status: 'switched', bucketName: 'bucket-c' });
    expect(auth?.userCreds?.bucketName).toBe('bucket-c');
  });
});
