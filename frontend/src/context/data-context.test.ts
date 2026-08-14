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
    expect(store().status['/']).toBe('ready');
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
    expect(store().status['/']).toBe('ready');
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
