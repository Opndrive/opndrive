/**
 * Bucket discovery store: one page of ListBuckets at a time, plus the rules
 * that keep it honest.
 *
 * Three of those rules carry almost all the risk, and each has a block below:
 *
 *  - A response only lands if it is still the newest one asked for. Bucket
 *    search is driven by typing, so slow answers overtaking fast ones is the
 *    normal case, not the edge case.
 *  - Pagination is the server's word. The client filter can leave a page
 *    showing nothing, and reading that as "no more buckets" would strand the
 *    search on a page whose matches are all further down.
 *  - A provider that will not list buckets is not a broken session. It has to
 *    end up as a flag the switcher can render, never as anything that touches
 *    the credentials.
 *
 * Nothing here mocks `@opndrive/s3-api`: the store only imports types from it,
 * so a fake with a `getBuckets` is the whole seam.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BYOS3ApiProvider, ListBucketResult } from '@opndrive/s3-api';
import {
  describeDiscoveryFailure,
  filterBuckets,
  useBucketsStore,
  type BucketOption,
} from './use-buckets-store';

const store = () => useBucketsStore.getState();

type GetBuckets = (params: { searchTerm?: string; nextToken: string | undefined }) => unknown;

/** A provider that answers `getBuckets` and nothing else, which is all this store calls. */
function provider(getBuckets: GetBuckets) {
  const spy = vi.fn(getBuckets);
  return { api: { getBuckets: spy } as unknown as BYOS3ApiProvider, getBuckets: spy };
}

function page(
  names: string[],
  extras: Partial<ListBucketResult> = {}
): ListBucketResult & { buckets: { Name: string }[] } {
  return {
    buckets: names.map((Name) => ({ Name })),
    totalBuckets: names.length,
    nextToken: undefined,
    isTruncated: false,
    ...extras,
  } as ListBucketResult & { buckets: { Name: string }[] };
}

/** A promise the test resolves by hand, for ordering two requests deliberately. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const accessDenied = () =>
  Object.assign(new Error('AccessDenied'), {
    name: 'AccessDenied',
    $metadata: { httpStatusCode: 403 },
  });

beforeEach(() => {
  store().reset();
});

describe('before anything is asked for', () => {
  it('holds nothing and belongs to nobody', () => {
    expect(store().status).toBe('idle');
    expect(store().buckets).toEqual([]);
    expect(store().owner).toBeNull();
    expect(store().error).toBeNull();
    expect(store().isTruncated).toBe(false);
  });
});

describe('loading the first page', () => {
  it('asks for everything when there is no search term', async () => {
    const { api, getBuckets } = provider(async () => page(['alpha']));

    await store().load(api, '');

    // Omitted, not empty: the API reads an absent term as "list them all".
    expect(getBuckets).toHaveBeenCalledWith({ searchTerm: undefined, nextToken: undefined });
    expect(store().status).toBe('ready');
    expect(store().owner).toBe(api);
  });

  it('sends the search term, trimmed', async () => {
    const { api, getBuckets } = provider(async () => page(['prod']));

    await store().load(api, '  prod  ');

    expect(getBuckets).toHaveBeenCalledWith({ searchTerm: 'prod', nextToken: undefined });
    expect(store().loadedFor).toBe('prod');
  });

  it('keeps the name, region and creation date of each bucket', async () => {
    const created = new Date('2026-01-02T03:04:05Z');
    const { api } = provider(async () => ({
      buckets: [{ Name: 'prod-eu', BucketRegion: 'eu-west-1', CreationDate: created }],
      totalBuckets: 1,
      nextToken: undefined,
      isTruncated: false,
    }));

    await store().load(api, '');

    // The region is what Step 3 hands to switchBucket; losing it here means a
    // cross-region bucket fails to verify for no visible reason.
    expect(store().buckets).toEqual<BucketOption[]>([
      { name: 'prod-eu', region: 'eu-west-1', createdAt: created },
    ]);
  });

  it('drops a bucket the provider gave no name', async () => {
    const { api } = provider(async () => ({
      buckets: [{ Name: 'real' }, { CreationDate: new Date() }],
      totalBuckets: 2,
      nextToken: undefined,
      isTruncated: false,
    }));

    await store().load(api, '');

    // A row nothing can be switched to is worse than no row.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['real']);
  });

  it('records the server pagination fields as given', async () => {
    const { api } = provider(async () => page(['a'], { nextToken: 'token-1', isTruncated: true }));

    await store().load(api, '');

    expect(store().nextToken).toBe('token-1');
    expect(store().isTruncated).toBe(true);
  });

  it('is ready, not empty-headed, when the account has no buckets', async () => {
    const { api } = provider(async () => page([]));

    await store().load(api, '');

    expect(store().status).toBe('ready');
    expect(store().buckets).toEqual([]);
    expect(store().isTruncated).toBe(false);
    expect(store().nextToken).toBeUndefined();
  });
});

describe('not asking twice for the same answer', () => {
  it('serves an already loaded list for the same provider and term', async () => {
    const { api, getBuckets } = provider(async () => page(['a']));

    await store().load(api, '');
    await store().load(api, '');

    // Opening and closing the switcher must not re-buy the same page.
    expect(getBuckets).toHaveBeenCalledTimes(1);
  });

  it('re-asks when the term changes', async () => {
    const { api, getBuckets } = provider(async () => page(['a']));

    await store().load(api, '');
    await store().load(api, 'prod');

    expect(getBuckets).toHaveBeenCalledTimes(2);
  });

  it('re-asks when forced', async () => {
    const { api, getBuckets } = provider(async () => page(['a']));

    await store().load(api, '');
    await store().load(api, '', { force: true });

    expect(getBuckets).toHaveBeenCalledTimes(2);
  });

  it('re-asks for a different provider, and keeps none of the old list', async () => {
    const first = provider(async () => page(['a-only']));
    const second = provider(async () => page(['b-only']));

    await store().load(first.api, '');
    await store().load(second.api, '');

    // The cache identity is the provider: a switch builds a new one, and its
    // buckets have nothing to do with the previous session's.
    expect(second.getBuckets).toHaveBeenCalledTimes(1);
    expect(store().owner).toBe(second.api);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['b-only']);
  });
});

describe('loading further pages', () => {
  async function loadedWithMore() {
    const pages = new Map<string | undefined, ListBucketResult>([
      [undefined, page(['a'], { nextToken: 'token-1', isTruncated: true })],
      ['token-1', page(['b'], { nextToken: 'token-2', isTruncated: true })],
    ]);
    const { api, getBuckets } = provider(async ({ nextToken }) => pages.get(nextToken) ?? page([]));

    await store().load(api, '');
    return { api, getBuckets };
  }

  it('sends the continuation token and the same search term', async () => {
    const pages = new Map<string | undefined, ListBucketResult>([
      [undefined, page(['prod-a'], { nextToken: 'token-1', isTruncated: true })],
      ['token-1', page(['prod-b'])],
    ]);
    const { api, getBuckets } = provider(async ({ nextToken }) => pages.get(nextToken) ?? page([]));

    await store().load(api, 'prod');
    await store().loadMore(api);

    expect(getBuckets).toHaveBeenLastCalledWith({ searchTerm: 'prod', nextToken: 'token-1' });
  });

  it('appends rather than replaces', async () => {
    const { api } = await loadedWithMore();

    await store().loadMore(api);

    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['a', 'b']);
    expect(store().nextToken).toBe('token-2');
    expect(store().isTruncated).toBe(true);
  });

  it('does nothing once the server says the list is complete', async () => {
    const { api, getBuckets } = provider(async () => page(['a']));

    await store().load(api, '');
    await store().loadMore(api);

    expect(getBuckets).toHaveBeenCalledTimes(1);
  });

  it('does not start a second page while one is in flight', async () => {
    const gate = deferred<ListBucketResult>();
    let calls = 0;
    const { api, getBuckets } = provider(async ({ nextToken }) => {
      calls++;
      if (nextToken === undefined) return page(['a'], { nextToken: 'token-1', isTruncated: true });
      return gate.promise;
    });

    await store().load(api, '');

    const first = store().loadMore(api);
    const second = store().loadMore(api);

    gate.resolve(page(['b']));
    await Promise.all([first, second]);

    // Two calls total: the first page and one page two. A list that scrolls
    // fast must not buy the same page twice.
    expect(getBuckets).toHaveBeenCalledTimes(2);
    expect(calls).toBe(2);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['a', 'b']);
  });

  it('refuses to page a list that belongs to another provider', async () => {
    await loadedWithMore();
    const other = provider(async () => page(['x']));

    await store().loadMore(other.api);

    expect(other.getBuckets).not.toHaveBeenCalled();
  });

  it('ignores a page of names it already has', async () => {
    const pages = new Map<string | undefined, ListBucketResult>([
      [undefined, page(['a', 'b'], { nextToken: 'token-1', isTruncated: true })],
      ['token-1', page(['b', 'c'], { nextToken: 'token-2', isTruncated: true })],
    ]);
    const { api } = provider(async ({ nextToken }) => pages.get(nextToken) ?? page([]));

    await store().load(api, '');
    await store().loadMore(api);

    // Providers that half-honour continuation tokens repeat rows; duplicated
    // names would collide as React keys and misreport the count.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['a', 'b', 'c']);
  });

  it('stops paging when the provider hands back the same token', async () => {
    const { api, getBuckets } = provider(async () =>
      page(['a'], { nextToken: 'same-token', isTruncated: true })
    );

    await store().load(api, '');
    await store().loadMore(api);

    // A provider that echoes the request token would otherwise be asked for
    // the same page forever.
    expect(store().isTruncated).toBe(false);
    expect(store().nextToken).toBeUndefined();
    expect(getBuckets).toHaveBeenCalledTimes(2);
  });

  it('keeps the pages it has when the next one fails', async () => {
    const { api } = provider(async ({ nextToken }) => {
      if (nextToken === undefined) return page(['a'], { nextToken: 'token-1', isTruncated: true });
      throw new Error('network');
    });

    await store().load(api, '');
    await store().loadMore(api);

    // Page one is still perfectly good; only the attempt to extend it failed.
    expect(store().status).toBe('ready');
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['a']);
    expect(store().isLoadingMore).toBe(false);
    expect(store().error).not.toBeNull();
  });
});

describe('a slow answer never overwrites a newer one', () => {
  it('keeps the newer search when the older one resolves last', async () => {
    const slow = deferred<ListBucketResult>();
    const fast = deferred<ListBucketResult>();
    const { api } = provider(async ({ searchTerm }) =>
      searchTerm === 'prod' ? slow.promise : fast.promise
    );

    const first = store().load(api, 'prod');
    const second = store().load(api, 'dev');

    // The order the user typed them in is not the order they come back in.
    fast.resolve(page(['dev-1']));
    await second;
    slow.resolve(page(['prod-1', 'prod-2']));
    await first;

    expect(store().loadedFor).toBe('dev');
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['dev-1']);
    expect(store().status).toBe('ready');
  });

  it('discards a page that arrives after the search moved on', async () => {
    const gate = deferred<ListBucketResult>();
    const { api } = provider(async ({ nextToken, searchTerm }) => {
      if (nextToken === 'token-1') return gate.promise;
      if (searchTerm === 'dev') return page(['dev-1']);
      return page(['prod-a'], { nextToken: 'token-1', isTruncated: true });
    });

    await store().load(api, 'prod');
    const pageTwo = store().loadMore(api);

    await store().load(api, 'dev');

    gate.resolve(page(['prod-b']));
    await pageTwo;

    // 'prod-b' under a search for "dev" would be inexplicable on screen.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['dev-1']);
    expect(store().isLoadingMore).toBe(false);
  });

  it('does not let a request outlive a reset', async () => {
    const gate = deferred<ListBucketResult>();
    const { api } = provider(async () => gate.promise);

    const pending = store().load(api, '');
    store().reset();

    gate.resolve(page(['a']));
    await pending;

    // reset() runs on a bucket switch, so a response landing after it would
    // put the previous session's buckets back.
    expect(store().status).toBe('idle');
    expect(store().buckets).toEqual([]);
    expect(store().owner).toBeNull();
  });

  it('leaves a failure that lost the race unreported', async () => {
    const slow = deferred<ListBucketResult>();
    const { api } = provider(async ({ searchTerm }) =>
      searchTerm === 'prod' ? slow.promise : page(['dev-1'])
    );

    const first = store().load(api, 'prod');
    await store().load(api, 'dev');

    slow.reject(accessDenied());
    await first;

    expect(store().status).toBe('ready');
    expect(store().error).toBeNull();
  });
});

describe('a provider that will not list buckets', () => {
  it('reports access denied as something asking again cannot fix', async () => {
    const { api } = provider(async () => {
      throw accessDenied();
    });

    await store().load(api, '');

    // Listing needs s3:ListAllMyBuckets, which the connect guides never ask
    // for, so a perfectly good session lands here routinely.
    expect(store().status).toBe('error');
    expect(store().error?.kind).toBe('permissions');
    expect(store().error?.unavailable).toBe(true);
  });

  it.each(['NotImplemented', 'MethodNotAllowed'])('reports %s the same way', async (name) => {
    const { api } = provider(async () => {
      throw Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 501 } });
    });

    await store().load(api, '');

    // Capability, read off the error rather than guessed from the provider's
    // name: nothing here knows or cares that it is talking to R2 or MinIO.
    expect(store().error?.unavailable).toBe(true);
  });

  it('treats a dropped connection as worth retrying', async () => {
    const { api } = provider(async () => {
      throw new TypeError('Failed to fetch');
    });

    await store().load(api, '');

    expect(store().error?.kind).toBe('network');
    expect(store().error?.unavailable).toBe(false);
    expect(store().error?.retryable).toBe(true);
  });

  it('leaves the session identity alone', async () => {
    const { api } = provider(async () => {
      throw accessDenied();
    });

    await store().load(api, '');

    // The store's whole reach: it may say it could not list, and nothing else.
    // Credentials, current bucket and navigation are auth-context's.
    expect(store().owner).toBe(api);
    expect(store().buckets).toEqual([]);
  });

  it('clears the failure when a later attempt works', async () => {
    let fail = true;
    const { api } = provider(async () => {
      if (fail) throw accessDenied();
      return page(['a']);
    });

    await store().load(api, '');
    fail = false;
    await store().load(api, '', { force: true });

    expect(store().error).toBeNull();
    expect(store().status).toBe('ready');
  });
});

describe('describeDiscoveryFailure', () => {
  it('keeps the wording the rest of the app uses', () => {
    const described = describeDiscoveryFailure(accessDenied());

    // Same classifier /connect uses, so one vocabulary explains every S3
    // failure in the product.
    expect(described.title).toBeTruthy();
    expect(described.detail).toBeTruthy();
    expect(described.kind).toBe('permissions');
  });
});

describe('filtering what was loaded', () => {
  const loaded: BucketOption[] = [
    { name: 'Alpha' },
    { name: 'Production' },
    { name: 'MyProductionBucket' },
    { name: 'Development' },
  ];

  it('matches anywhere in the name, not just the start', () => {
    const visible = filterBuckets(loaded, 'production');

    // The server side of this is a prefix match, which finds 'Production' and
    // misses 'MyProductionBucket' - usually the one being looked for.
    expect(visible.map((bucket) => bucket.name)).toEqual(['Production', 'MyProductionBucket']);
  });

  it('ignores case in both directions', () => {
    expect(filterBuckets(loaded, 'ALPHA').map((b) => b.name)).toEqual(['Alpha']);
    expect(filterBuckets([{ name: 'PROD-EU' }], 'prod').map((b) => b.name)).toEqual(['PROD-EU']);
  });

  it('ignores surrounding whitespace', () => {
    expect(filterBuckets(loaded, '  dev  ').map((b) => b.name)).toEqual(['Development']);
  });

  it('returns the same list when there is nothing to filter by', () => {
    // Same reference, not a copy: an unfiltered list is the common case and a
    // fresh array every render would defeat the memo downstream.
    expect(filterBuckets(loaded, '')).toBe(loaded);
    expect(filterBuckets(loaded, '   ')).toBe(loaded);
  });

  it('can legitimately match nothing', () => {
    expect(filterBuckets(loaded, 'staging')).toEqual([]);
  });

  it('still narrows a provider that ignored the search term', async () => {
    // Answers every search with the whole list, which several S3-compatible
    // providers do.
    const { api } = provider(async () => page(['alpha', 'production', 'my-production', 'dev']));

    await store().load(api, 'production');

    expect(store().buckets).toHaveLength(4);
    expect(filterBuckets(store().buckets, 'production').map((b) => b.name)).toEqual([
      'production',
      'my-production',
    ]);
  });
});

describe('pagination follows the server, not the filter', () => {
  it('still offers more pages when the filter leaves nothing visible', async () => {
    const { api } = provider(async () =>
      page(['alpha', 'beta'], { nextToken: 'token-1', isTruncated: true })
    );

    await store().load(api, 'prod');

    // The provider ignored the term, so nothing on this page matches - but
    // there are more pages, and the matches may all be on them.
    expect(filterBuckets(store().buckets, 'prod')).toEqual([]);
    expect(store().isTruncated).toBe(true);
    expect(store().nextToken).toBe('token-1');
  });

  it('does not read totalBuckets as a page count', async () => {
    const { api } = provider(async () =>
      page(['a'], { totalBuckets: 1, nextToken: 'token-1', isTruncated: true })
    );

    await store().load(api, '');

    // totalBuckets describes the page it came with, not the account. Deriving
    // "more?" from it would stop after the first page every time.
    expect(store().isTruncated).toBe(true);
  });
});

/**
 * Asking twice for the same page.
 *
 * Superseding a request is not the same as not making it: the loser's response
 * is discarded, but it was still sent and still billed. React Strict Mode runs
 * every effect twice in development - it is on by default here - so without
 * this each open of the switcher cost two ListBuckets.
 */
describe('the same page is never bought twice', () => {
  it('joins a request already in flight instead of issuing another', async () => {
    const gate = deferred<ListBucketResult>();
    const { api, getBuckets } = provider(async () => gate.promise);

    const first = store().load(api, '');
    const second = store().load(api, '');

    gate.resolve(page(['x']));
    await Promise.all([first, second]);

    expect(getBuckets).toHaveBeenCalledTimes(1);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['x']);
  });

  it('joins only for the same provider and term', async () => {
    const gate = deferred<ListBucketResult>();
    const { api, getBuckets } = provider(async ({ searchTerm }) =>
      searchTerm === undefined ? gate.promise : page(['prod-1'])
    );

    const first = store().load(api, '');
    await store().load(api, 'prod');

    gate.resolve(page(['everything']));
    await first;

    // A different question deserves its own request; it supersedes rather than
    // joins.
    expect(getBuckets).toHaveBeenCalledTimes(2);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['prod-1']);
  });

  it('still re-asks when forced', async () => {
    const gate = deferred<ListBucketResult>();
    let resolved = false;
    const { api, getBuckets } = provider(async () => {
      if (resolved) return page(['fresh']);
      return gate.promise;
    });

    const first = store().load(api, '');
    resolved = true;
    const forced = store().load(api, '', { force: true });

    gate.resolve(page(['stale']));
    await Promise.all([first, forced]);

    // `refresh` means the caller wants a new answer, not the one already on
    // its way.
    expect(getBuckets).toHaveBeenCalledTimes(2);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['fresh']);
  });

  it('can be asked again once the first answer has landed', async () => {
    const { api, getBuckets } = provider(async () => page(['a']));

    await store().load(api, '');
    await store().load(api, 'prod');
    await store().load(api, '', { force: true });

    // The slot is released when the request settles; a stuck slot would make
    // the list unrefreshable for the rest of the session.
    expect(getBuckets).toHaveBeenCalledTimes(3);
  });
});

describe('an error does not outlive the failure it describes', () => {
  it('clears a failed page once a later one succeeds', async () => {
    let failNextPage = true;
    const { api } = provider(async ({ nextToken }) => {
      if (nextToken === undefined) return page(['a'], { nextToken: 'token-1', isTruncated: true });
      if (failNextPage) throw new TypeError('Failed to fetch');
      return page(['b']);
    });

    await store().load(api, '');
    await store().loadMore(api);
    expect(store().error).not.toBeNull();

    failNextPage = false;
    await store().loadMore(api);

    // An error beside a list that has just grown is a contradiction on screen.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['a', 'b']);
    expect(store().error).toBeNull();
  });
});

describe('no answer crosses from one provider to another', () => {
  it('drops a first page that arrives after another provider took over', async () => {
    const gate = deferred<ListBucketResult>();
    const first = provider(async () => gate.promise);
    const second = provider(async () => page(['b-only']));

    const pending = store().load(first.api, '');
    await store().load(second.api, '');

    gate.resolve(page(['a-secret']));
    await pending;

    // The one that actually matters for isolation: not a tidy switch, but a
    // request issued under one set of credentials landing under another.
    expect(store().owner).toBe(second.api);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['b-only']);
  });
});

describe('pagination stops when there is nothing usable to page with', () => {
  it('ignores truncation the server gave no token for', async () => {
    const { api, getBuckets } = provider(async () =>
      page(['a'], { isTruncated: true, nextToken: undefined })
    );

    await store().load(api, '');
    await store().loadMore(api);

    // Asking again without a token just re-fetches page one forever.
    expect(getBuckets).toHaveBeenCalledTimes(1);
  });

  it('ignores a token the server did not say was needed', async () => {
    const { api, getBuckets } = provider(async () =>
      page(['a'], { isTruncated: false, nextToken: 'token-1' })
    );

    await store().load(api, '');
    await store().loadMore(api);

    expect(getBuckets).toHaveBeenCalledTimes(1);
  });
});

describe('a finished request never blocks the next one', () => {
  it('lets a term whose first attempt failed be asked for again', async () => {
    let failing = true;
    const { api, getBuckets } = provider(async () => {
      if (failing) throw new TypeError('Failed to fetch');
      return page(['a']);
    });

    await store().load(api, 'prod');
    expect(store().status).toBe('error');

    failing = false;
    await store().load(api, 'prod');

    // The in-flight slot has to be released when the request settles. Held on
    // to, the retry would "join" a promise that finished long ago and resolve
    // without ever asking again - a failure the switcher could never recover
    // from without a reload.
    expect(getBuckets).toHaveBeenCalledTimes(2);
    expect(store().status).toBe('ready');
  });

  it('does not join a request that a reset already retired', async () => {
    const gate = deferred<ListBucketResult>();
    let calls = 0;
    const { api, getBuckets } = provider(async () => {
      calls += 1;
      return calls === 1 ? gate.promise : page(['fresh']);
    });

    const pending = store().load(api, '');
    store().reset();
    const second = store().load(api, '');

    gate.resolve(page(['stale']));
    await Promise.all([pending, second]);

    // The retired request writes nothing by design, so joining it would leave
    // the switcher empty and idle with no request in flight and no way to
    // notice.
    expect(getBuckets).toHaveBeenCalledTimes(2);
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['fresh']);
  });
});

describe('the request and the filter never contradict each other', () => {
  it('sends a lowercase term as a server-side prefix', async () => {
    const { api, getBuckets } = provider(async () => page(['prod-eu']));

    await store().load(api, 'prod');

    expect(getBuckets).toHaveBeenCalledWith({ searchTerm: 'prod', nextToken: undefined });
  });

  it('asks for everything when the term has capitals in it', async () => {
    const { api, getBuckets } = provider(async () => page(['prod-eu', 'dev-eu']));

    await store().load(api, 'PROD');

    // ListBuckets matches Prefix byte for byte, and bucket names are
    // lowercase, so sending 'PROD' would come back empty and the switcher
    // would report that no such bucket exists.
    expect(getBuckets).toHaveBeenCalledWith({ searchTerm: undefined, nextToken: undefined });
    expect(filterBuckets(store().buckets, 'PROD').map((bucket) => bucket.name)).toEqual([
      'prod-eu',
    ]);
  });

  it('keeps a bucket that legitimately has capitals findable', async () => {
    const { api, getBuckets } = provider(async () => page(['LegacyBucket', 'other']));

    await store().load(api, 'Legacy');

    // Lowercasing the term instead would have hidden this one: buckets made in
    // us-east-1 before 2018 may have capitals.
    expect(getBuckets).toHaveBeenCalledWith({ searchTerm: undefined, nextToken: undefined });
    expect(filterBuckets(store().buckets, 'Legacy').map((bucket) => bucket.name)).toEqual([
      'LegacyBucket',
    ]);
  });

  it('continues a mixed-case search with the same request shape', async () => {
    const pages = new Map<string | undefined, ListBucketResult>([
      [undefined, page(['a'], { nextToken: 'token-1', isTruncated: true })],
      ['token-1', page(['Prod-B'])],
    ]);
    const { api, getBuckets } = provider(async ({ nextToken }) => pages.get(nextToken) ?? page([]));

    await store().load(api, 'PROD');
    await store().loadMore(api);

    // A page must continue the request that produced its token; changing the
    // prefix halfway through is undefined behaviour.
    expect(getBuckets).toHaveBeenLastCalledWith({ searchTerm: undefined, nextToken: 'token-1' });
  });
});

describe('a region is reported only when the provider stated one', () => {
  it('leaves it undefined rather than filling in the session region', async () => {
    const { api } = provider(async () => page(['plain']));

    await store().load(api, '');

    // Step 3 passes this straight to switchBucket, and switchBucket keeps the
    // current region when none is given. Inventing one here would build a
    // client for a region the bucket may not be in, and every request would
    // come back as a redirect.
    expect(store().buckets).toEqual([{ name: 'plain', region: undefined, createdAt: undefined }]);
  });
});

/**
 * Recording a create or a delete without re-listing.
 *
 * ListBuckets is billed, and after a create or a delete the answer is already
 * known - the call that just succeeded is the only thing that could have
 * changed it. So the store is patched instead, and these are the rules that
 * keep that patch from lying: it belongs to one provider, it does not
 * duplicate, and it puts a new bucket where a listing would have.
 */
describe('recording a bucket that was just created or deleted', () => {
  it('places a created bucket where a listing would have put it', async () => {
    const { api } = provider(async () => page(['alpha', 'charlie']));

    await store().load(api, '');
    store().addBucket(api, { name: 'bravo' });

    // S3 lists buckets in name order. Appending would leave the row a user
    // just made sitting in the wrong place until the next listing moved it.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('appends one that sorts last', async () => {
    const { api } = provider(async () => page(['alpha', 'bravo']));

    await store().load(api, '');
    store().addBucket(api, { name: 'zulu' });

    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['alpha', 'bravo', 'zulu']);
  });

  it('keeps the region it was created in', async () => {
    const { api } = provider(async () => page(['alpha']));

    await store().load(api, '');
    store().addBucket(api, { name: 'bravo', region: 'eu-west-1' });

    // What a later switch needs to rebuild the client for the right place.
    expect(store().buckets[1]).toMatchObject({ name: 'bravo', region: 'eu-west-1' });
  });

  it('ignores a name the listing already picked up', async () => {
    const { api } = provider(async () => page(['alpha', 'bravo']));

    await store().load(api, '');
    store().addBucket(api, { name: 'bravo' });

    // Not a conflict - a create that raced a listing which already has it.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['alpha', 'bravo']);
  });

  it('drops a deleted bucket', async () => {
    const { api } = provider(async () => page(['alpha', 'bravo', 'charlie']));

    await store().load(api, '');
    store().removeBucket(api, 'bravo');

    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['alpha', 'charlie']);
  });

  it('hands back the same array when the delete matched nothing', async () => {
    const { api } = provider(async () => page(['alpha']));

    await store().load(api, '');
    const before = store().buckets;
    store().removeBucket(api, 'never-listed');

    // A new array would re-render every subscriber for no change at all.
    expect(store().buckets).toBe(before);
  });

  it('touches nothing when the list belongs to another provider', async () => {
    const { api } = provider(async () => page(['alpha']));
    const { api: other } = provider(async () => page([]));

    await store().load(api, '');
    store().addBucket(other, { name: 'bravo' });
    store().removeBucket(other, 'alpha');

    // Another account's buckets are not this one's, in either direction.
    expect(store().buckets.map((bucket) => bucket.name)).toEqual(['alpha']);
  });
});
