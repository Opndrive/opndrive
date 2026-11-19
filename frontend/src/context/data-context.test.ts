/**
 * Drive store: reading a folder page by page, and the races around it.
 *
 * Every test here drives real concurrency rather than asserting on a single
 * settled call. The bugs only exist in the window between issuing a request and
 * its response landing, so a test that awaits each call in turn would pass
 * against broken code as happily as against the fix. `deferred()` hands back a
 * request whose resolution the test controls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PAGE_SIZE, useDriveStore, useRecentState } from './data-context';
import { MAX_LISTINGS, listingOf } from './folder-listing';

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {},
}));

vi.mock('@/features/dashboard/stores/use-search-store', () => ({
  useSearchStore: {
    getState: () => ({ invalidatePrefix: vi.fn(), clearCache: vi.fn() }),
  },
}));

const store = () => useDriveStore.getState();

type Page = {
  files: { Key: string; LastModified?: Date }[];
  folders: { Prefix: string }[];
  nextToken?: string;
  isTruncated?: boolean;
};

function deferred() {
  let resolve!: (value: Page) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Page>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function page(keys: string[], overrides: Partial<Page> = {}): Page {
  return { files: keys.map((Key) => ({ Key })), folders: [], isTruncated: false, ...overrides };
}

/** The signal each call was given, in order. */
const signals: (AbortSignal | undefined)[] = [];
const fetchDirectoryStructure = vi.fn();

function connect() {
  store().setApiS3({ fetchDirectoryStructure } as never);
  store().setRootPrefix('/');
  store().setCurrentPrefix('/');
}

const keysAt = (key = '/') => (store().listings[key]?.files ?? []).map((file) => file.id);

beforeEach(() => {
  vi.clearAllMocks();
  signals.length = 0;
  // A request the test did not queue an answer for is a bug in the test.
  fetchDirectoryStructure.mockImplementation(() => Promise.reject(new Error('unexpected request')));
  store().clearAllData();
  connect();
});

/** Queues answers and records the abort signal each request was given. */
function answer(...results: (Page | Promise<Page> | Error)[]) {
  for (const result of results) {
    fetchDirectoryStructure.mockImplementationOnce(
      (_p: string, _m: number, _t?: string, opts?: { signal?: AbortSignal }) => {
        signals.push(opts?.signal);
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      }
    );
  }
}

describe('reading a folder for the first time', () => {
  it('asks S3 for a full page of 1,000, from the top', async () => {
    answer(page(['a.txt']));

    await store().fetchData();

    expect(fetchDirectoryStructure).toHaveBeenCalledWith('', PAGE_SIZE, undefined, {
      signal: signals[0],
    });
    expect(store().listings['/']).toMatchObject({ status: 'ready', loaded: true, complete: true });
  });

  it('leaves the marker object of the folder itself out of its rows', async () => {
    store().setCurrentPrefix('docs/');
    answer(page(['docs/', 'docs/a.txt']));

    await store().fetchData();

    expect(keysAt('docs/')).toEqual(['docs/a.txt']);
  });

  it('does not issue a second request when asked again while the first is open', async () => {
    const first = deferred();
    answer(first.promise);

    const navigateIn = store().fetchData();
    const navigateBack = store().fetchData();

    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);

    first.resolve(page(['a.txt', 'b.txt']));
    await Promise.all([navigateIn, navigateBack]);

    // Joining has to mean waiting for it, not returning early to a caller that
    // then renders an empty folder.
    expect(keysAt()).toEqual(['a.txt', 'b.txt']);
  });

  it('records why a read failed, specifically enough to act on', async () => {
    answer(Object.assign(new Error('Access Denied'), { name: 'AccessDenied' }));

    await store().fetchData();

    expect(store().listings['/']).toMatchObject({ status: 'error', loaded: false });
    expect(store().listings['/']!.failure?.kind).toBe('permissions');
  });

  it('forgets the reason once the folder loads', async () => {
    answer(new Error('network'), page(['a.txt']));

    await store().fetchData();
    await store().fetchData({ sync: true });

    expect(store().listings['/']).toMatchObject({ status: 'ready', failure: undefined });
  });
});

describe('coming back to a folder', () => {
  it('shows the cached rows at once and re-reads page 1 quietly', async () => {
    answer(page(['a.txt']));
    await store().fetchData();

    const refresh = deferred();
    answer(refresh.promise);
    const revisit = store().fetchData();

    // The cached rows are there, and not behind a 'loading' skeleton.
    expect(keysAt()).toEqual(['a.txt']);
    expect(store().listings['/']!.status).toBe('ready');
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(2);

    refresh.resolve(page(['a.txt', 'b.txt']));
    await revisit;

    expect(keysAt()).toEqual(['a.txt', 'b.txt']);
  });

  it('keeps the rows when the quiet re-read fails', async () => {
    answer(page(['a.txt']), new Error('network'));
    await store().fetchData();

    await store().fetchData();

    expect(store().listings['/']!.status).toBe('ready');
    expect(keysAt()).toEqual(['a.txt']);
  });

  it('remembers where the folder was scrolled to', () => {
    useDriveStore.setState({ listings: { 'docs/': listingOf({}) } });

    store().rememberScrollOffset('docs/', 4200);

    expect(store().listings['docs/']!.scrollOffset).toBe(4200);
  });
});

describe('one request at a time per folder', () => {
  it('lets a forced refresh replace a read already open, and stops the old one', async () => {
    const initial = deferred();
    const refresh = deferred();
    answer(initial.promise, refresh.promise);

    const loading = store().fetchData();
    const refreshing = store().fetchData({ sync: true });

    expect(signals[0]?.aborted).toBe(true);

    refresh.resolve(page(['fresh.txt']));
    initial.resolve(page(['stale.txt']));
    await Promise.all([loading, refreshing]);

    // The refresh was asked for last, so it wins whatever order they answer in.
    expect(keysAt()).toEqual(['fresh.txt']);
  });

  it('does not let a replaced read report an error', async () => {
    const initial = deferred();
    answer(initial.promise, page(['fresh.txt']));

    const loading = store().fetchData();
    await store().fetchData({ sync: true });

    initial.reject(new Error('network down'));
    await loading;

    expect(store().listings['/']!.status).toBe('ready');
    expect(keysAt()).toEqual(['fresh.txt']);
  });

  it('gives each folder its own request', async () => {
    answer(page(['root.txt']));
    await store().fetchData();

    store().setCurrentPrefix('docs/');
    answer(page(['docs/a.txt']));
    await store().fetchData();

    expect(keysAt('/')).toEqual(['root.txt']);
    expect(keysAt('docs/')).toEqual(['docs/a.txt']);
  });
});

describe('leaving a folder', () => {
  it('stops what it was still reading and leaves nothing half done', async () => {
    const rootPage = deferred();
    answer(rootPage.promise);
    const reading = store().fetchData();

    store().setCurrentPrefix('docs/');

    expect(signals[0]?.aborted).toBe(true);

    rootPage.resolve(page(['root.txt']));
    await reading;

    // Not 'loading' for good: read again on the way back.
    expect(store().listings['/']).toMatchObject({ status: 'idle', loaded: false });
  });

  it('stops a next page too, and keeps the rows already read', async () => {
    answer(page(['a.txt'], { isTruncated: true, nextToken: 't1' }));
    await store().fetchData();

    const next = deferred();
    answer(next.promise);
    const paging = store().loadMoreData();

    store().setCurrentPrefix('docs/');
    next.resolve(page(['b.txt']));
    await paging;

    expect(signals[1]?.aborted).toBe(true);
    expect(keysAt()).toEqual(['a.txt']);
    expect(store().listings['/']!.nextPage.status).toBe('idle');
  });
});

describe('paging through a folder', () => {
  async function loadFirstPage() {
    answer(page(['a.txt'], { isTruncated: true, nextToken: 'token-1' }));
    await store().fetchData();
    fetchDirectoryStructure.mockClear();
  }

  it('reads the next page from where S3 stopped', async () => {
    await loadFirstPage();
    answer(page(['b.txt']));

    await store().loadMoreData();

    expect(fetchDirectoryStructure).toHaveBeenCalledWith('', PAGE_SIZE, 'token-1', {
      signal: signals[1],
    });
    expect(keysAt()).toEqual(['a.txt', 'b.txt']);
    expect(store().listings['/']!.complete).toBe(true);
  });

  it('reads the next page once for two asks in the same tick', async () => {
    await loadFirstPage();
    const next = deferred();
    answer(next.promise);

    const first = store().loadMoreData();
    const second = store().loadMoreData();
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);

    next.resolve(page(['b.txt']));
    await Promise.all([first, second]);

    expect(keysAt()).toEqual(['a.txt', 'b.txt']);
  });

  it('drops rows it already has rather than showing them twice', async () => {
    await loadFirstPage();
    answer(page(['a.txt', 'b.txt']));

    await store().loadMoreData();

    expect(keysAt()).toEqual(['a.txt', 'b.txt']);
  });

  it('does nothing when there is no next page', async () => {
    answer(page(['a.txt']));
    await store().fetchData();
    fetchDirectoryStructure.mockClear();

    await store().loadMoreData();

    expect(fetchDirectoryStructure).not.toHaveBeenCalled();
  });

  it('keeps every row when a page fails, says why, and can be retried', async () => {
    await loadFirstPage();
    answer(new Error('network down'), page(['b.txt']));

    await store().loadMoreData();

    expect(keysAt()).toEqual(['a.txt']);
    expect(store().listings['/']!.status).toBe('ready');
    expect(store().listings['/']!.nextPage).toMatchObject({ status: 'error' });
    expect(store().listings['/']!.nextPage.failure).toBeDefined();

    await store().loadMoreData();

    expect(keysAt()).toEqual(['a.txt', 'b.txt']);
    expect(store().listings['/']!.nextPage).toEqual({ status: 'idle' });
  });

  it('waits behind a first page being read rather than racing it', async () => {
    await loadFirstPage();
    const refresh = deferred();
    answer(refresh.promise);
    const refreshing = store().fetchData({ sync: true });

    await store().loadMoreData();

    // The refresh may move the cursor; a page read now could follow the old one.
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);

    refresh.resolve(page(['a.txt'], { isTruncated: true, nextToken: 'token-1' }));
    await refreshing;
  });

  it('gives way to a refresh that starts while it is open', async () => {
    await loadFirstPage();
    const next = deferred();
    answer(next.promise, page(['a.txt'], { isTruncated: true, nextToken: 'token-1' }));
    const paging = store().loadMoreData();

    await store().fetchData({ sync: true });
    next.resolve(page(['b.txt']));
    await paging;

    expect(signals[1]?.aborted).toBe(true);
    expect(keysAt()).toEqual(['a.txt']);
    expect(store().listings['/']!.nextPage.status).toBe('idle');
  });
});

describe('refreshing a folder that has been paged through', () => {
  async function twoPages() {
    answer(page(['a.txt', 'c.txt'], { isTruncated: true, nextToken: 't1' }));
    await store().fetchData();
    answer(page(['m.txt', 'z.txt'], { isTruncated: true, nextToken: 't2' }));
    await store().loadMoreData();
  }

  it('reads page 1 again and keeps the rows the user scrolled to beyond it', async () => {
    await twoPages();
    fetchDirectoryStructure.mockClear();
    answer(page(['a.txt', 'b.txt', 'd.txt'], { isTruncated: true, nextToken: 'fresh-t1' }));

    await store().fetchData({ sync: true });

    // From the top, never from the stored cursor.
    expect(fetchDirectoryStructure).toHaveBeenCalledWith('', PAGE_SIZE, undefined, {
      signal: signals[signals.length - 1],
    });
    // c.txt was inside page 1's new range and is gone; m.txt and z.txt lie
    // beyond it and stay, with the cursor that continues after them.
    expect(keysAt()).toEqual(['a.txt', 'b.txt', 'd.txt', 'm.txt', 'z.txt']);
    expect(store().listings['/']!.cursor).toBe('t2');
  });

  it('becomes the whole folder when page 1 is now the only page', async () => {
    await twoPages();
    answer(page(['a.txt']));

    await store().fetchData({ sync: true });

    expect(keysAt()).toEqual(['a.txt']);
    expect(store().listings['/']!.complete).toBe(true);
  });
});

describe('ending the session', () => {
  it('ignores a response that arrives after the data was cleared', async () => {
    const pending = deferred();
    answer(pending.promise);
    const reading = store().fetchData();

    store().clearAllData();
    expect(signals[0]?.aborted).toBe(true);

    pending.resolve(page(['old-bucket.txt']));
    await reading;

    expect(store().listings).toEqual({});
  });

  it('does not append a page requested before the session ended', async () => {
    answer(page(['a.txt'], { isTruncated: true, nextToken: 't1' }));
    await store().fetchData();
    const next = deferred();
    answer(next.promise);
    const paging = store().loadMoreData();

    store().clearAllData();
    connect();
    answer(page(['new-bucket.txt']));
    await store().fetchData();

    next.resolve(page(['old-bucket-page-2.txt']));
    await paging;

    expect(keysAt()).toEqual(['new-bucket.txt']);
  });

  it('does not let a new session join the previous session request', async () => {
    const old = deferred();
    answer(old.promise);
    const oldRead = store().fetchData();

    store().clearAllData();
    connect();
    answer(page(['new.txt']));
    await store().fetchData();

    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(2);
    old.resolve(page(['old.txt']));
    await oldRead;
    expect(keysAt()).toEqual(['new.txt']);
  });

  it('does not carry a failure into the next session', async () => {
    answer(new Error('network'));
    await store().fetchData();

    store().clearAllData();

    expect(store().listings).toEqual({});
  });
});

describe('the recent-folders cap', () => {
  it('forgets the least recently used folder past the cap, never the one on screen', async () => {
    for (let i = 0; i <= MAX_LISTINGS; i++) {
      store().setCurrentPrefix(`f${i}/`);
      answer(page([`f${i}/a.txt`]));
      await store().fetchData();
    }

    const keys = Object.keys(store().listings);
    expect(keys).toHaveLength(MAX_LISTINGS);
    expect(keys).not.toContain('f0/');
    expect(keys).toContain(`f${MAX_LISTINGS}/`);
  });

  it('keeps a folder that was shown again recently', async () => {
    // Every folder used within one millisecond, which is what a fast machine
    // does here: recency has to come from order, not the clock alone.
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    for (let i = 0; i < MAX_LISTINGS; i++) {
      store().setCurrentPrefix(`f${i}/`);
      answer(page([`f${i}/a.txt`]));
      await store().fetchData();
    }

    // Back to the first folder, then one more new folder.
    store().setCurrentPrefix('f0/');
    store().setCurrentPrefix('new/');
    answer(page(['new/a.txt']));
    await store().fetchData();

    expect(Object.keys(store().listings)).toContain('f0/');
    expect(Object.keys(store().listings)).not.toContain('f1/');
    vi.restoreAllMocks();
  });
});

describe('the home page suggestions', () => {
  const at = (minutesAgo: number) => new Date(Date.UTC(2026, 0, 1) - minutesAgo * 60_000);

  async function loadRoot(complete: boolean) {
    answer({
      files: [
        { Key: 'old.txt', LastModified: at(60) },
        { Key: 'new.txt', LastModified: at(1) },
        { Key: 'mid.txt', LastModified: at(30) },
      ],
      folders: [{ Prefix: 'a/' }, { Prefix: 'b/' }],
      isTruncated: !complete,
      nextToken: complete ? undefined : 't1',
    });
    await store().fetchData();
  }

  it('lists the newest of the loaded files first', async () => {
    await loadRoot(true);
    const { result } = renderHook(() => useRecentState(2, 1));

    expect(result.current.state).toBe('ready');
    const data = result.current.state === 'ready' ? result.current.data : undefined;
    expect(data?.files.map((file) => file.Key)).toEqual(['new.txt', 'mid.txt']);
    expect(data?.folders.map((folder) => folder.Prefix)).toEqual(['a/']);
    expect(data).toMatchObject({ hasMoreFiles: true, hasMoreFolders: true });
  });

  it('is built from the listing itself, not a copy kept beside it', async () => {
    await loadRoot(true);
    const { result } = renderHook(() => useRecentState());

    const data = result.current.state === 'ready' ? result.current.data : undefined;
    const fromListing = store().listings['/']!.files.find((file) => file.Key === 'new.txt');
    expect(data?.files[0]).toBe(fromListing);
  });

  it('says when it was chosen from only the loaded part of the folder', async () => {
    await loadRoot(false);
    const { result } = renderHook(() => useRecentState());

    const data = result.current.state === 'ready' ? result.current.data : undefined;
    expect(data).toMatchObject({ complete: false, loadedCount: 5 });
  });

  it('follows the listing as rows change', async () => {
    await loadRoot(true);
    const { result } = renderHook(() => useRecentState());

    act(() => {
      store().removeFiles(['new.txt']);
    });

    const data = result.current.state === 'ready' ? result.current.data : undefined;
    expect(data?.files.map((file) => file.Key)).toEqual(['mid.txt', 'old.txt']);
  });
});
