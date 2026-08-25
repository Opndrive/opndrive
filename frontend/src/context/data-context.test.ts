/**
 * Drive store: the races around fetching a prefix and paging through it.
 *
 * Every test here drives real concurrency rather than asserting on a single
 * settled call. The bugs only exist in the window between issuing a request and
 * its response landing, so a test that awaits each call in turn would pass
 * against the broken code as happily as against the fix.
 *
 * `deferred()` is the tool for that: it hands back a request whose resolution
 * the test controls, so two calls can genuinely be open at once and be resolved
 * in whichever order the scenario needs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDriveStore } from './data-context';

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {},
}));

vi.mock('@/features/dashboard/stores/use-search-store', () => ({
  useSearchStore: {
    getState: () => ({
      invalidatePrefix: vi.fn(),
      clearCache: vi.fn(),
    }),
  },
}));

const store = () => useDriveStore.getState();

type DirectoryStructure = {
  files: { Key: string }[];
  folders: { Prefix: string }[];
  nextToken?: string;
  isTruncated?: boolean;
};

/** A page of results whose resolution the test controls. */
function deferred() {
  let resolve!: (value: DirectoryStructure) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<DirectoryStructure>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function page(keys: string[], overrides: Partial<DirectoryStructure> = {}): DirectoryStructure {
  return {
    files: keys.map((Key) => ({ Key })),
    folders: [],
    isTruncated: false,
    ...overrides,
  };
}

const fetchDirectoryStructure = vi.fn();

/** Mounts a store pointed at the bucket root, the way the browse page does. */
function connect() {
  store().setApiS3({ fetchDirectoryStructure } as never);
  store().setRootPrefix('/');
  store().setCurrentPrefix('/');
}

/** Object keys currently cached for the root prefix, in order. */
function cachedKeys(): string[] {
  return (useDriveStore.getState().cache['/']?.files ?? []).map((file) => file.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllData also resets the module-scope request bookkeeping, which the
  // zustand auto-reset between tests cannot reach.
  store().clearAllData();
  connect();
});

describe('returning to a folder whose request is still open', () => {
  it('does not issue a second identical request', async () => {
    const first = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(first.promise);

    // Navigate into A, away, and back before A's request has answered.
    const navigateIn = store().fetchData({ sync: false });
    const navigateBack = store().fetchData({ sync: false });

    // 'loading' is not 'ready', and the cache is still empty, so both the
    // status check and the data check used to wave the second call through.
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);

    first.resolve(page(['a.txt', 'b.txt']));
    await Promise.all([navigateIn, navigateBack]);

    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);
    expect(cachedKeys()).toEqual(['a.txt', 'b.txt']);
    expect(store().directory['/']?.status).toBe('ready');
  });

  it('gives the second caller the first caller result', async () => {
    const first = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(first.promise);

    const navigateIn = store().fetchData({ sync: false });
    const navigateBack = store().fetchData({ sync: false });

    first.resolve(page(['a.txt']));
    await Promise.all([navigateIn, navigateBack]);

    // Joining the open request has to mean waiting for it, not returning early
    // to a caller that then renders an empty folder.
    expect(cachedKeys()).toEqual(['a.txt']);
  });

  it('starts a fresh request once the first one has finished', async () => {
    fetchDirectoryStructure.mockResolvedValueOnce(page(['a.txt']));
    await store().fetchData({ sync: false });

    fetchDirectoryStructure.mockResolvedValueOnce(page(['a.txt', 'b.txt']));
    await store().fetchData({ sync: true });

    // The dedupe is per open request, not a permanent lock.
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(2);
    expect(cachedKeys()).toEqual(['a.txt', 'b.txt']);
  });

  it('does not dedupe two different folders against each other', async () => {
    const rootPage = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(rootPage.promise);
    const loadingRoot = store().fetchData({ sync: false });

    // Open a subfolder while the root is still loading.
    store().setCurrentPrefix('docs/');
    const docsPage = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(docsPage.promise);
    const loadingDocs = store().fetchData({ sync: false });

    // The dedupe is per cache key. Sharing one would leave the second folder
    // waiting on a request that answers for the first.
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(2);

    docsPage.resolve(page(['docs/a.txt']));
    rootPage.resolve(page(['root.txt']));
    await Promise.all([loadingRoot, loadingDocs]);

    expect(useDriveStore.getState().cache['/']?.files.map((f) => f.id)).toEqual(['root.txt']);
    expect(useDriveStore.getState().cache['docs/']?.files.map((f) => f.id)).toEqual(['docs/a.txt']);
  });

  it('lets a forced sync run rather than joining a read already open', async () => {
    const initial = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(initial.promise);

    const loading = store().fetchData({ sync: false });

    const refresh = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(refresh.promise);
    const refreshing = store().fetchData({ sync: true });

    // The user asked for fresh data, not for whatever was already being read
    // before they asked.
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(2);

    refresh.resolve(page(['fresh.txt']));
    initial.resolve(page(['stale.txt']));
    await Promise.all([loading, refreshing]);

    // The refresh was issued last, so it wins even though it answered first.
    // Letting the older read land here is how a rename or delete appeared to
    // undo itself a moment after it succeeded.
    expect(cachedKeys()).toEqual(['fresh.txt']);
  });

  it('does not let a superseded request report an error', async () => {
    const initial = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(initial.promise);
    const loading = store().fetchData({ sync: false });

    fetchDirectoryStructure.mockResolvedValueOnce(page(['fresh.txt']));
    await store().fetchData({ sync: true });

    initial.reject(new Error('network down'));
    await loading;

    // A folder that loaded fine must not render as failed because an older
    // request for it happened to give up afterwards.
    expect(store().directory['/']?.status).toBe('ready');
    expect(cachedKeys()).toEqual(['fresh.txt']);
  });
});

describe('paging through a folder', () => {
  /** Loads page one, leaving a continuation token behind. */
  async function loadFirstPage() {
    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['a.txt'], { isTruncated: true, nextToken: 'token-1' })
    );
    await store().fetchData({ sync: false });
    fetchDirectoryStructure.mockClear();
  }

  it('fetches the next page once for two clicks in the same tick', async () => {
    await loadFirstPage();

    const next = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(next.promise);

    const firstClick = store().loadMoreData();
    const secondClick = store().loadMoreData();

    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);

    next.resolve(page(['b.txt']));
    await Promise.all([firstClick, secondClick]);

    // Both clicks reading the same continuation token is what put every row of
    // that page on screen twice.
    expect(cachedKeys()).toEqual(['a.txt', 'b.txt']);
  });

  it('drops rows it already has rather than showing them twice', async () => {
    await loadFirstPage();

    // A page that overlaps what is already cached, however it arises.
    fetchDirectoryStructure.mockResolvedValueOnce(page(['a.txt', 'b.txt']));
    await store().loadMoreData();

    expect(cachedKeys()).toEqual(['a.txt', 'b.txt']);
  });

  it('appends to the refreshed list, not to the copy it started with', async () => {
    await loadFirstPage();

    const nextPage = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(nextPage.promise);
    const paging = store().loadMoreData();

    // A delete or rename refreshes the folder while the page is still open.
    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['a.txt'], { isTruncated: true, nextToken: 'token-1' })
    );
    await store().fetchData({ sync: true });

    nextPage.resolve(page(['b.txt']));
    await paging;

    // Appending to the pre-refresh snapshot would have put back whatever that
    // refresh removed.
    expect(cachedKeys()).toEqual(['a.txt', 'b.txt']);
  });

  it('does nothing when there is no next page', async () => {
    fetchDirectoryStructure.mockResolvedValueOnce(page(['a.txt'], { isTruncated: false }));
    await store().fetchData({ sync: false });
    fetchDirectoryStructure.mockClear();

    await store().loadMoreData();

    expect(fetchDirectoryStructure).not.toHaveBeenCalled();
  });

  it('reports a failed page without losing what is already listed', async () => {
    await loadFirstPage();

    // The store logs this itself; capturing it keeps the suite output clean and
    // pins that a failed page is actually reported somewhere.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    fetchDirectoryStructure.mockRejectedValueOnce(new Error('network down'));
    await store().loadMoreData();

    expect(store().loadMoreStatus['/']).toBe('error');
    expect(cachedKeys()).toEqual(['a.txt']);
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });
});

describe('refreshing a folder that has been paged through', () => {
  it('reloads from the top instead of just the last page', async () => {
    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['a.txt'], { isTruncated: true, nextToken: 'token-1' })
    );
    await store().fetchData({ sync: false });

    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['b.txt'], { isTruncated: true, nextToken: 'token-2' })
    );
    await store().loadMoreData();
    expect(cachedKeys()).toEqual(['a.txt', 'b.txt']);

    fetchDirectoryStructure.mockClear();
    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['a.txt'], { isTruncated: true, nextToken: 'token-1' })
    );
    await store().fetchData({ sync: true });

    // A sync replaces the cache wholesale, so it has to read from the top. It
    // used to pass the stored continuation token, which replaced a fully paged
    // folder with nothing but the page after the last one loaded.
    expect(fetchDirectoryStructure).toHaveBeenCalledWith('', 1000);
    expect(cachedKeys()).toEqual(['a.txt']);
  });
});

describe('recent items on the home page', () => {
  it('does not issue a second request when returning to the folder', async () => {
    const first = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(first.promise);

    const navigateIn = store().fetchRecentItems({ sync: false, itemsPerType: 10 });
    const navigateBack = store().fetchRecentItems({ sync: false, itemsPerType: 10 });

    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);

    first.resolve(page(['a.txt']));
    await Promise.all([navigateIn, navigateBack]);

    expect(store().recentCache['/']?.files.map((file) => file.id)).toEqual(['a.txt']);
  });

  it('tracks its requests separately from the folder listing', async () => {
    const listing = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(listing.promise);
    const loadingListing = store().fetchData({ sync: false });

    // Same prefix, different cache. One must not be treated as superseding the
    // other just because they were issued for the same folder.
    fetchDirectoryStructure.mockResolvedValueOnce(page(['recent.txt']));
    await store().fetchRecentItems({ sync: false, itemsPerType: 10 });

    listing.resolve(page(['listed.txt']));
    await loadingListing;

    expect(cachedKeys()).toEqual(['listed.txt']);
    expect(store().recentCache['/']?.files.map((file) => file.id)).toEqual(['recent.txt']);
  });
});

describe('ending the session', () => {
  it('ignores a response that arrives after the data was cleared', async () => {
    const pending = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(pending.promise);
    const loading = store().fetchData({ sync: false });

    store().clearAllData();

    pending.resolve(page(['a.txt']));
    await loading;

    // Writing here would repopulate the previous session's listing into a store
    // that logout had just emptied.
    expect(useDriveStore.getState().cache['/']).toBeUndefined();
  });

  it('does not append a page requested before the session ended', async () => {
    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['old-a.txt'], { isTruncated: true, nextToken: 'token-1' })
    );
    await store().fetchData({ sync: false });

    const nextPage = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(nextPage.promise);
    const paging = store().loadMoreData();

    // Log out and connect somewhere else, then open the same prefix. The cache
    // is populated again by the time the old page lands, so checking that it
    // exists is not enough to tell the two sessions apart.
    store().clearAllData();
    connect();
    fetchDirectoryStructure.mockResolvedValueOnce(page(['new-a.txt']));
    await store().fetchData({ sync: false });

    nextPage.resolve(page(['old-b.txt']));
    await paging;

    // Appending here would list the previous bucket's objects inside the new one.
    expect(cachedKeys()).toEqual(['new-a.txt']);
  });

  it('does not write paging status back into a cleared store', async () => {
    fetchDirectoryStructure.mockResolvedValueOnce(
      page(['a.txt'], { isTruncated: true, nextToken: 'token-1' })
    );
    await store().fetchData({ sync: false });

    const nextPage = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(nextPage.promise);
    const paging = store().loadMoreData();

    store().clearAllData();

    nextPage.resolve(page(['b.txt']));
    await paging;

    // Logout emptied these; a response landing afterwards must not put a stray
    // entry back for a folder that no longer belongs to anyone.
    expect(useDriveStore.getState().loadMoreStatus).toEqual({});
    expect(useDriveStore.getState().cache).toEqual({});
  });

  it('does not let a new session join the previous session request', async () => {
    const pending = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(pending.promise);
    const loading = store().fetchData({ sync: false });

    store().clearAllData();
    connect();

    fetchDirectoryStructure.mockResolvedValueOnce(page(['new-bucket.txt']));
    await store().fetchData({ sync: false });

    pending.resolve(page(['old-bucket.txt']));
    await loading;

    expect(cachedKeys()).toEqual(['new-bucket.txt']);
  });
});

/**
 * A failed listing used to be indistinguishable from one still in flight: the
 * catch threw the error away and set a status that both dashboard pages read
 * through `=== 'ready'`, so the "not ready" branch drew a loading skeleton that
 * nothing would ever replace.
 */
describe('a listing that fails', () => {
  function sdkError(name: string, httpStatusCode?: number) {
    const error = new Error(name);
    error.name = name;

    return Object.assign(error, { $metadata: { httpStatusCode } });
  }

  it('records why, rather than discarding it', async () => {
    fetchDirectoryStructure.mockRejectedValueOnce(sdkError('AccessDenied', 403));

    await store().fetchData({ sync: false });

    expect(useDriveStore.getState().directory['/']?.status).toBe('error');
    expect(useDriveStore.getState().directory['/']?.failure?.kind).toBe('permissions');
  });

  it('keeps the reason specific enough to act on', async () => {
    fetchDirectoryStructure.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await store().fetchData({ sync: false });

    // A blocked CORS preflight and a wrong secret key are different problems
    // fixed in different places, so they must not arrive as the same message.
    expect(useDriveStore.getState().directory['/']?.failure?.kind).toBe('network');
  });

  it('forgets the reason once the folder loads', async () => {
    fetchDirectoryStructure.mockRejectedValueOnce(sdkError('AccessDenied', 403));
    await store().fetchData({ sync: false });
    expect(useDriveStore.getState().directory['/']?.failure).toBeDefined();

    // What Retry does. A stale reason left behind would render over a folder
    // that had just come back fine.
    fetchDirectoryStructure.mockResolvedValueOnce(page(['a.txt']));
    await store().fetchData({ sync: true });

    expect(useDriveStore.getState().directory['/']?.status).toBe('ready');
    expect(useDriveStore.getState().directory['/']?.failure).toBeUndefined();
  });

  it('does not carry a failure into the next session', async () => {
    fetchDirectoryStructure.mockRejectedValueOnce(sdkError('AccessDenied', 403));
    await store().fetchData({ sync: false });

    store().clearAllData();

    expect(useDriveStore.getState().directory).toEqual({});
  });

  // The superseding rule already covered the status; the reason has to follow
  // it, or a folder that loaded fine renders someone else's failure.
  it('does not report a superseded failure over a newer result', async () => {
    const slowFailure = deferred();
    fetchDirectoryStructure.mockReturnValueOnce(slowFailure.promise);
    const first = store().fetchData({ sync: true });

    fetchDirectoryStructure.mockResolvedValueOnce(page(['a.txt']));
    await store().fetchData({ sync: true });

    slowFailure.reject(sdkError('AccessDenied', 403));
    await first;

    expect(useDriveStore.getState().directory['/']?.status).toBe('ready');
    expect(useDriveStore.getState().directory['/']?.failure).toBeUndefined();
  });
});

/**
 * The directory listing and the recent-items list are two different requests
 * against the same prefix, and refreshCurrentData runs them together. Their
 * outcomes have to stay apart: one succeeding must not erase why the other
 * failed, or the page that failed loses the specific reason it exists to show
 * and falls back to "something went wrong".
 */
describe('two requests for one prefix', () => {
  function sdkError(name: string, httpStatusCode?: number) {
    const error = new Error(name);
    error.name = name;

    return Object.assign(error, { $metadata: { httpStatusCode } });
  }

  it('keeps the recent failure when the directory listing succeeds', async () => {
    // What refreshCurrentData does: both in flight at once, same prefix.
    fetchDirectoryStructure
      .mockRejectedValueOnce(sdkError('AccessDenied', 403))
      .mockResolvedValueOnce(page(['a.txt']));

    await Promise.all([
      store().fetchRecentItems({ sync: true, itemsPerType: 10 }),
      store().fetchData({ sync: true }),
    ]);

    const state = useDriveStore.getState();

    expect(state.recent['/']?.status).toBe('error');
    // Not 'unknown': the recent list still has to be able to say it was denied.
    expect(state.recent['/']?.failure?.kind).toBe('permissions');
  });

  it('keeps the directory failure when the recent listing succeeds', async () => {
    fetchDirectoryStructure
      .mockResolvedValueOnce(page(['a.txt']))
      .mockRejectedValueOnce(sdkError('NoSuchBucket', 404));

    await Promise.all([
      store().fetchRecentItems({ sync: true, itemsPerType: 10 }),
      store().fetchData({ sync: true }),
    ]);

    const state = useDriveStore.getState();

    expect(state.directory['/']?.status).toBe('error');
    expect(state.directory['/']?.failure?.kind).toBe('bucket');
  });
});
