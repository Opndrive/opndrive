/**
 * The bucket switcher's data layer, from the consumer's side.
 *
 * The load-bearing behaviour is what the hook does *not* do. Mounting it must
 * not list buckets - the dashboard mounts the switcher on every page and
 * ListBuckets is billed - and it must never reach past discovery into the
 * session: no credentials, no navigation, no bucket change. Selecting a bucket
 * is `useAuth().switchBucket`, and this only offers candidates.
 *
 * Timers are faked so the debounce is exercised deliberately rather than by
 * waiting on it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { BYOS3ApiProvider, ListBucketResult } from '@opndrive/s3-api';
import { useBuckets, type UseBucketsResult } from './use-buckets';
import { useBucketsStore } from '@/features/dashboard/stores/use-buckets-store';

const mockUseAuthGuard = vi.fn();

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => mockUseAuthGuard(),
}));

type GetBuckets = (params: { searchTerm?: string; nextToken: string | undefined }) => unknown;

/**
 * A provider with the two methods this hook is allowed to touch, plus a spy on
 * the one it must never call.
 */
function makeProvider(bucketName: string, getBuckets: GetBuckets) {
  const list = vi.fn(getBuckets);
  const setBucketName = vi.fn();

  const api = {
    getBuckets: list,
    getBucketName: () => bucketName,
    setBucketName,
  } as unknown as BYOS3ApiProvider;

  return { api, list, setBucketName };
}

function page(names: string[], extras: Partial<ListBucketResult> = {}): ListBucketResult {
  return {
    buckets: names.map((Name) => ({ Name })),
    totalBuckets: names.length,
    nextToken: undefined,
    isTruncated: false,
    ...extras,
  } as ListBucketResult;
}

/** Runs the debounce out and lets whatever it started settle. */
async function settleSearch() {
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockUseAuthGuard.mockReset();
  useBucketsStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('nothing is requested until the switcher asks', () => {
  it('lists no buckets merely because it was mounted', () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());

    // The dashboard mounts this on every page and hardly anyone opens it.
    expect(list).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.buckets).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('lists nothing for a search typed before discovery started', async () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());

    act(() => result.current.setSearchTerm('prod'));
    await settleSearch();

    expect(list).not.toHaveBeenCalled();
  });

  it('loads once discovery is asked for', async () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['alpha', 'beta']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());

    await act(async () => result.current.loadBuckets());

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ searchTerm: undefined, nextToken: undefined });
    expect(result.current.status).toBe('ready');
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['alpha', 'beta']);
  });
});

describe('searching', () => {
  it('asks once for a word rather than once per letter', async () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['prod']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());
    list.mockClear();

    act(() => result.current.setSearchTerm('p'));
    act(() => result.current.setSearchTerm('pr'));
    act(() => result.current.setSearchTerm('pro'));
    act(() => result.current.setSearchTerm('prod'));

    // Nothing has gone out yet: each keystroke restarted the wait.
    expect(list).not.toHaveBeenCalled();

    await settleSearch();

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ searchTerm: 'prod', nextToken: undefined });
  });

  it('shows what the user typed straight away, without waiting for the server', async () => {
    const { api } = makeProvider('bucket-a', async () => page(['alpha', 'production']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    act(() => result.current.setSearchTerm('prod'));

    // Filtering the page already loaded is free, so the list narrows on the
    // keystroke and the request only refines it.
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['production']);
    expect(result.current.searchTerm).toBe('prod');
  });

  it('narrows a provider that ignored the search term', async () => {
    const { api } = makeProvider('bucket-a', async () =>
      // Answers every search with everything, which several S3-compatible
      // providers do.
      page(['Alpha', 'Production', 'MyProductionBucket', 'Development'])
    );
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    act(() => result.current.setSearchTerm('production'));
    await settleSearch();

    // Server-side matching is a prefix match even when it works, so
    // 'MyProductionBucket' is only ever found by the client filter.
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual([
      'Production',
      'MyProductionBucket',
    ]);
  });

  it('never mixes one search with another', async () => {
    const answers = new Map([
      ['prod', page(['prod-1'])],
      ['dev', page(['dev-1'])],
    ]);
    const { api } = makeProvider('bucket-a', async ({ searchTerm }) =>
      searchTerm ? answers.get(searchTerm) : page(['everything'])
    );
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    act(() => result.current.setSearchTerm('prod'));
    await settleSearch();
    act(() => result.current.setSearchTerm('dev'));
    await settleSearch();

    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['dev-1']);
  });
});

describe('paging through a long list', () => {
  const pages = () =>
    new Map<string | undefined, ListBucketResult>([
      [undefined, page(['a'], { nextToken: 'token-1', isTruncated: true })],
      ['token-1', page(['b'])],
    ]);

  it('offers more only while the server says there is more', async () => {
    const answers = pages();
    const { api } = makeProvider('bucket-a', async ({ nextToken }) => answers.get(nextToken));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());

    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps offering more when the filter has hidden the whole page', async () => {
    const { api } = makeProvider('bucket-a', async () =>
      page(['alpha', 'beta'], { nextToken: 'token-1', isTruncated: true })
    );
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    act(() => result.current.setSearchTerm('prod'));

    // Nothing on this page matches, and the matches may be on the next one.
    // Reading "no visible rows" as "end of list" would strand the search here.
    expect(result.current.buckets).toEqual([]);
    expect(result.current.hasMore).toBe(true);
  });
});

describe('a new S3 identity is a new list', () => {
  it('shows none of the previous provider buckets', async () => {
    const first = makeProvider('bucket-a', async () => page(['a-only']));
    const second = makeProvider('bucket-b', async () => page(['b-only']));

    mockUseAuthGuard.mockReturnValue({ apiS3: first.api });
    const { result, rerender } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['a-only']);

    mockUseAuthGuard.mockReturnValue({ apiS3: second.api });
    rerender();

    // Not one frame of the previous session's buckets under the new bucket's
    // name: the identity is checked as the list is read, not in an effect that
    // runs after the render that would have shown them.
    expect(result.current.buckets).toEqual([]);
    expect(result.current.status).toBe('idle');
    expect(result.current.currentBucketName).toBe('bucket-b');
  });

  it('does not go and list buckets for the new identity by itself', async () => {
    const first = makeProvider('bucket-a', async () => page(['a-only']));
    const second = makeProvider('bucket-b', async () => page(['b-only']));

    mockUseAuthGuard.mockReturnValue({ apiS3: first.api });
    const { result, rerender } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    mockUseAuthGuard.mockReturnValue({ apiS3: second.api });
    await act(async () => rerender());

    // The switcher is closed by the time a switch lands, so a fresh billed
    // request here would be for a dropdown nobody has open.
    expect(second.list).not.toHaveBeenCalled();

    await act(async () => result.current.loadBuckets());

    expect(second.list).toHaveBeenCalledTimes(1);
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['b-only']);
  });

  it('forgets the search term along with the list', async () => {
    const first = makeProvider('bucket-a', async () => page(['a-only']));
    const second = makeProvider('bucket-b', async () => page(['b-only']));

    mockUseAuthGuard.mockReturnValue({ apiS3: first.api });
    const { result, rerender } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());
    act(() => result.current.setSearchTerm('prod'));
    await settleSearch();

    mockUseAuthGuard.mockReturnValue({ apiS3: second.api });
    rerender();

    expect(result.current.searchTerm).toBe('');
  });
});

describe('when the provider will not list buckets', () => {
  const denied = () =>
    Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });

  it('says discovery is unavailable rather than that the session is broken', async () => {
    const { api } = makeProvider('bucket-a', async () => {
      throw denied();
    });
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    // Listing needs s3:ListAllMyBuckets, which the connect guides do not ask
    // for. The switcher's answer is a bucket name field, not a logout.
    expect(result.current.status).toBe('error');
    expect(result.current.isDiscoveryUnavailable).toBe(true);
    expect(result.current.error?.kind).toBe('permissions');
    expect(result.current.error?.title).toBeTruthy();
  });

  it('leaves the current bucket exactly where it was', async () => {
    const { api, setBucketName } = makeProvider('bucket-a', async () => {
      throw denied();
    });
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    // The session is untouched and still perfectly usable: browsing,
    // uploading and downloading never needed this call.
    expect(result.current.currentBucketName).toBe('bucket-a');
    expect(setBucketName).not.toHaveBeenCalled();
  });

  it('marks a dropped connection as worth retrying', async () => {
    let fail = true;
    const { api } = makeProvider('bucket-a', async () => {
      if (fail) throw new TypeError('Failed to fetch');
      return page(['a']);
    });
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    expect(result.current.isDiscoveryUnavailable).toBe(false);
    expect(result.current.error?.retryable).toBe(true);

    fail = false;
    await act(async () => result.current.refresh());

    expect(result.current.error).toBeNull();
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['a']);
  });
});

describe('what the switcher is handed', () => {
  it('carries the region through, for switchBucket to use', async () => {
    const { api } = makeProvider('bucket-a', async () => ({
      buckets: [{ Name: 'prod-eu', BucketRegion: 'eu-west-1' }],
      totalBuckets: 1,
      nextToken: undefined,
      isTruncated: false,
    }));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    // switchBucket(name, region) rebuilds the client for that region; without
    // this the bucket answers every request with a redirect.
    expect(result.current.buckets[0]).toMatchObject({ name: 'prod-eu', region: 'eu-west-1' });
  });

  it('reads the current bucket from auth rather than keeping its own copy', () => {
    const { api } = makeProvider('bucket-a', async () => page([]));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());

    expect(result.current.currentBucketName).toBe('bucket-a');
  });

  it('answers with nothing at all when there is no session', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: null });

    const { result } = renderHook(() => useBuckets());

    act(() => result.current.loadBuckets());
    act(() => result.current.loadMore());
    act(() => result.current.refresh());

    expect(result.current.currentBucketName).toBeNull();
    expect(result.current.buckets).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('keeps its callbacks stable across renders', async () => {
    const { api } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result, rerender } = renderHook(() => useBuckets());
    const first = {
      setSearchTerm: result.current.setSearchTerm,
      loadBuckets: result.current.loadBuckets,
      loadMore: result.current.loadMore,
    };

    rerender();

    // The switcher memoises rows on these; a new identity per render would
    // re-render every row on every keystroke.
    expect(result.current.setSearchTerm).toBe(first.setSearchTerm);
    expect(result.current.loadBuckets).toBe(first.loadBuckets);
    expect(result.current.loadMore).toBe(first.loadMore);
  });

  it('does not leave a debounce running after unmount', () => {
    const { api } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result, unmount } = renderHook(() => useBuckets());

    act(() => result.current.setSearchTerm('prod'));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * The isolation that has to hold in the render itself, not in an effect.
 *
 * Clearing the store when the provider changes is an effect, and effects run
 * *after* the render that would have painted the old list under the new
 * bucket's name. Asserting after `rerender()` therefore proves nothing: by
 * then the effect has been and gone. These capture every rendered value so the
 * frame in between is visible.
 */
describe('a previous provider list is invisible from the first render', () => {
  it('never renders the old buckets, not even for one frame', async () => {
    const first = makeProvider('bucket-a', async () => page(['a-only']));
    const second = makeProvider('bucket-b', async () => page(['b-only']));

    const seen: UseBucketsResult[] = [];
    mockUseAuthGuard.mockReturnValue({ apiS3: first.api });

    const { result, rerender } = renderHook(() => {
      const value = useBuckets();
      seen.push(value);
      return value;
    });

    await act(async () => result.current.loadBuckets());
    expect(seen.at(-1)?.buckets.map((bucket) => bucket.name)).toEqual(['a-only']);

    const beforeSwitch = seen.length;
    mockUseAuthGuard.mockReturnValue({ apiS3: second.api });
    rerender();

    const afterSwitch = seen.slice(beforeSwitch);
    expect(afterSwitch.length).toBeGreaterThan(0);
    // Every one of them, including the very first: the ownership check is part
    // of reading the store, not something an effect catches up with.
    expect(afterSwitch.every((value) => value.buckets.length === 0)).toBe(true);
    expect(afterSwitch.every((value) => value.status === 'idle')).toBe(true);
  });

  it('hides the old error and the old pagination too', async () => {
    const denied = Object.assign(new Error('AccessDenied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    const first = makeProvider('bucket-a', async () => {
      throw denied;
    });
    const second = makeProvider('bucket-b', async () => page(['b-only']));

    const seen: UseBucketsResult[] = [];
    mockUseAuthGuard.mockReturnValue({ apiS3: first.api });

    const { result, rerender } = renderHook(() => {
      const value = useBuckets();
      seen.push(value);
      return value;
    });

    await act(async () => result.current.loadBuckets());
    expect(seen.at(-1)?.isDiscoveryUnavailable).toBe(true);

    const beforeSwitch = seen.length;
    mockUseAuthGuard.mockReturnValue({ apiS3: second.api });
    rerender();

    // "This connection cannot list buckets" is about the connection that said
    // so. Carrying it into the next one would send the switcher straight to
    // its manual fallback for no reason.
    expect(seen.slice(beforeSwitch).every((value) => value.error === null)).toBe(true);
    expect(seen.slice(beforeSwitch).every((value) => value.hasMore === false)).toBe(true);
  });
});

describe('effects running twice changes nothing', () => {
  it('lists buckets once under Strict Mode', async () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets(), { wrapper: StrictMode });

    await act(async () => result.current.loadBuckets());

    // Strict Mode is on by default in this app, so a load effect that did not
    // join its own in-flight request billed every development open twice.
    expect(list).toHaveBeenCalledTimes(1);
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['a']);
  });

  it('still lists nothing on mount under Strict Mode', () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    renderHook(() => useBuckets(), { wrapper: StrictMode });

    expect(list).not.toHaveBeenCalled();
  });

  it('refreshes with one request, even before the switcher was opened', async () => {
    const { api, list } = makeProvider('bucket-a', async () => page(['a']));
    mockUseAuthGuard.mockReturnValue({ apiS3: api });

    const { result } = renderHook(() => useBuckets());

    await act(async () => result.current.refresh());

    // `refresh` starts discovery as well as forcing it, so the effect it wakes
    // must land on the request it already made rather than beside it.
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('a pending keystroke does not follow the user to the next bucket', () => {
  it('cancels a debounce left over from the previous provider', async () => {
    const first = makeProvider('bucket-a', async () => page(['a-only']));
    const second = makeProvider('bucket-b', async () => page(['b-only']));

    mockUseAuthGuard.mockReturnValue({ apiS3: first.api });
    const { result, rerender } = renderHook(() => useBuckets());
    await act(async () => result.current.loadBuckets());

    act(() => result.current.setSearchTerm('prod'));

    mockUseAuthGuard.mockReturnValue({ apiS3: second.api });
    await act(async () => rerender());

    // The timer from that keystroke is due about now.
    await settleSearch();
    await act(async () => result.current.loadBuckets());

    // Left running, it would set the request term back to 'prod' after the
    // switch: an empty search box that quietly searches for the previous
    // bucket's term, showing a short list with nothing to explain it.
    expect(result.current.searchTerm).toBe('');
    expect(second.list).toHaveBeenCalledTimes(1);
    expect(second.list).toHaveBeenCalledWith({ searchTerm: undefined, nextToken: undefined });
    expect(result.current.buckets.map((bucket) => bucket.name)).toEqual(['b-only']);
  });
});
