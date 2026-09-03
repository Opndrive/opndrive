'use client';

import { create } from 'zustand';
import type { BYOS3ApiProvider, ListBucketResult } from '@opndrive/s3-api';
import { classifyConnectionFailure, type ConnectionFailure } from '@/lib/s3/connection-failure';

/**
 * The bucket list behind the bucket switcher.
 *
 * Kept in a module-level store rather than component state so opening the
 * switcher, closing it and opening it again does not pay for ListBuckets three
 * times - it is a billed request, and the answer rarely changes inside a
 * session.
 *
 * The store discovers and nothing else. It never switches bucket, never
 * touches credentials and never navigates: `auth-context.switchBucket` is the
 * only thing allowed to change the active S3 identity, and this only offers it
 * candidates.
 */

/** A bucket as the switcher needs it: enough to show a row, and to switch to it. */
export interface BucketOption {
  name: string;
  /**
   * Where the bucket lives, when the provider said so.
   *
   * Carried through because `switchBucket(name, region)` needs it: a bucket in
   * another region answers every request with a redirect until the client is
   * rebuilt for it.
   *
   * Often absent. S3 only fills `BucketRegion` in when the ListBuckets request
   * carried at least one parameter, so an unfiltered first page typically
   * comes back without regions. Undefined means "not stated", which the caller
   * should read as "assume the session's current region", not "no region".
   */
  region?: string;
  createdAt?: Date;
}

/**
 * Why bucket discovery failed, in the vocabulary the rest of the app already
 * uses for S3 failures, plus the one distinction that only matters here.
 */
export interface BucketsError extends ConnectionFailure {
  /**
   * True when asking again cannot help, because this connection is simply not
   * able to list buckets.
   *
   * Listing every bucket needs `s3:ListAllMyBuckets`, which is not among the
   * permissions the connect guides ask for, and some S3-compatible providers
   * do not implement the call at all. Either way the storage session itself is
   * perfectly valid - the user can browse, upload and download exactly as
   * before. It only means the switcher has to ask for a bucket name instead of
   * offering a list, which is why this is a flag on a failure rather than
   * anything that touches the session.
   */
  unavailable: boolean;
}

/**
 * - `idle`    - nothing has been asked for. The state a mounted switcher sits
 *   in until its dropdown is opened; see the lazy-loading note on `load`.
 * - `loading` - the first page is in flight.
 * - `ready`   - `buckets` holds a page (possibly an empty one).
 * - `error`   - the first page failed; `error` says why.
 */
export type BucketsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Stable identity for "no buckets", so a render that has none does not churn. */
const NO_BUCKETS: BucketOption[] = [];

interface BucketsStore {
  /**
   * The provider the loaded list belongs to.
   *
   * Held rather than the credentials because provider identity is what changes
   * on a bucket switch - `switchBucket` builds a new `BYOS3ApiProvider` - so
   * comparing against it is how a reader knows whether the list in this store
   * is theirs or the previous session's.
   */
  owner: BYOS3ApiProvider | null;
  status: BucketsStatus;
  /** Every bucket loaded so far, in server order, before any client filtering. */
  buckets: BucketOption[];
  /** The search term `buckets` was requested with. */
  loadedFor: string;
  /** The server's continuation token, and its word on whether more exist. */
  nextToken: string | undefined;
  isTruncated: boolean;
  isLoadingMore: boolean;
  error: BucketsError | null;

  load: (api: BYOS3ApiProvider, searchTerm: string, options?: { force?: boolean }) => Promise<void>;
  loadMore: (api: BYOS3ApiProvider) => Promise<void>;
  /**
   * Records a bucket this session has just created.
   *
   * Written into the loaded list rather than triggering a re-list, because
   * ListBuckets is billed and the answer is already known: the create call
   * that just succeeded is the only thing that could have changed it.
   *
   * Ignored when the list belongs to another provider, and when the name is
   * already there - the second is not a conflict, it is a create that raced a
   * listing which already picked the bucket up.
   */
  addBucket: (api: BYOS3ApiProvider, bucket: BucketOption) => void;
  /**
   * Forgets a bucket this session has just deleted, on the same reasoning as
   * `addBucket`. Never called on a failed delete: a row that vanishes from a
   * switcher is a promise that the bucket is gone.
   */
  removeBucket: (api: BYOS3ApiProvider, bucketName: string) => void;
  reset: () => void;
}

/**
 * The newest request issued, and a counter to mint ids from.
 *
 * Module scope rather than store state, exactly as the drive store keeps its
 * own: a pending request id is not something any component renders, and
 * putting it in the store would re-render every subscriber twice per request.
 *
 * A response is only written if its id is still the newest. That is what stops
 * a slow search for "prod" landing on top of a faster one for "dev" issued
 * after it, and what retires a page-two request the moment the search changes
 * underneath it.
 */
let requestCounter = 0;
let latestRequestId = 0;

function claimRequestId(): number {
  requestCounter += 1;
  latestRequestId = requestCounter;
  return requestCounter;
}

function isSuperseded(id: number): boolean {
  return latestRequestId !== id;
}

/**
 * The first-page request currently open, if any.
 *
 * A second ask for the page already being fetched joins this one instead of
 * buying it again. Superseding alone was not enough: the loser's response is
 * thrown away, but the *request* has still been made and billed.
 *
 * That is not a theoretical double-call. React Strict Mode runs effects twice
 * in development - it is on by default in this app - so every open of the
 * switcher issued two ListBuckets, and `refresh()` before the first open
 * issued another pair.
 *
 * One slot rather than a map because there is only ever one list: a request
 * for a different provider or a different term supersedes this one rather than
 * running beside it.
 */
let inFlightLoad: { api: BYOS3ApiProvider; term: string; promise: Promise<void> } | null = null;

/** The SDK's bucket shape, taken from the API's own result type rather than redeclared. */
type ApiBucket = ListBucketResult['buckets'][number];

/**
 * Reads the API's buckets into the shape the switcher renders.
 *
 * Anything without a name is dropped: the name is the whole point - it is what
 * gets displayed and what `switchBucket` is called with - and a row that
 * cannot be switched to is worse than no row.
 */
function toOptions(buckets: readonly ApiBucket[]): BucketOption[] {
  const options: BucketOption[] = [];

  for (const bucket of buckets) {
    if (!bucket.Name) continue;

    options.push({
      name: bucket.Name,
      region: bucket.BucketRegion,
      createdAt: bucket.CreationDate,
    });
  }

  return options;
}

/**
 * Places a bucket where a listing would have put it.
 *
 * S3 returns buckets in name order, so a created bucket dropped at the end of
 * the list would sit in the wrong place until the next listing moved it - the
 * row a user just made would appear to jump. Sorting the whole list instead
 * would be worse: a provider that orders its listing differently would have
 * its order rewritten by an unrelated create.
 */
function insertSorted(buckets: BucketOption[], bucket: BucketOption): BucketOption[] {
  const at = buckets.findIndex((existing) => existing.name.localeCompare(bucket.name) > 0);

  if (at === -1) return [...buckets, bucket];

  return [...buckets.slice(0, at), bucket, ...buckets.slice(at)];
}

/** Appends a page, dropping names already listed. See `loadMore` for why. */
function appendPage(existing: BucketOption[], page: BucketOption[]): BucketOption[] {
  const seen = new Set(existing.map((bucket) => bucket.name));
  const added = page.filter((bucket) => !seen.has(bucket.name));

  return added.length === 0 ? existing : [...existing, ...added];
}

/**
 * Error names and statuses that mean this provider does not implement bucket
 * listing at all. Distinct from a permissions failure, which means it does but
 * this key may not use it - the user-facing consequence is the same, so both
 * end up as `unavailable`.
 */
const LISTING_UNSUPPORTED = new Set(['NotImplemented', 'MethodNotAllowed']);
const LISTING_UNSUPPORTED_STATUS = new Set([405, 501]);

/**
 * Reads the name and status off an SDK throw.
 *
 * A small local copy of what `classifyConnectionFailure` does internally,
 * because the classification alone cannot answer the question this store has
 * to answer: "was that a no, or a never?".
 */
function readError(error: unknown): { name: string; status?: number } {
  const shape = (error ?? {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = shape.$metadata?.httpStatusCode;

  return {
    name: typeof shape.name === 'string' ? shape.name : '',
    status: typeof status === 'number' ? status : undefined,
  };
}

/** Classifies a discovery failure and says whether asking again could ever help. */
export function describeDiscoveryFailure(error: unknown): BucketsError {
  const failure = classifyConnectionFailure(error);
  const { name, status } = readError(error);

  const unsupported = LISTING_UNSUPPORTED.has(name) || LISTING_UNSUPPORTED_STATUS.has(status ?? -1);

  return {
    ...failure,
    // A permissions failure here is `s3:ListAllMyBuckets` missing, which no
    // amount of retrying adds. Everything else - a dropped connection, a
    // throttle, an unrecognised error - is worth another go.
    unavailable: failure.kind === 'permissions' || unsupported,
  };
}

/**
 * What to put in the request, or undefined to ask for everything.
 *
 * The provider matches this as a literal prefix - `getBuckets` passes it
 * straight to ListBuckets' `Prefix`, which is byte-exact - while the client
 * filter below matches case-insensitively. Those two disagree the moment
 * anybody types a capital: `PROD` narrows the request to buckets whose names
 * start with `PROD`, of which there are none, because S3 bucket names are
 * lowercase. The server would have thrown away the very rows the client filter
 * exists to find, and the switcher would say there is no such bucket.
 *
 * So a term that is not already lowercase is not sent at all: the page comes
 * back unfiltered and the client filter answers. That costs the same request
 * the switcher makes when nothing is typed, and it is the only version that
 * cannot hide a bucket the user is looking at. Lowercasing the term instead
 * would break the other direction - buckets created in us-east-1 before 2018
 * may legitimately have capitals in their names.
 */
function serverSearchTerm(term: string): string | undefined {
  if (term === '') return undefined;

  return term === term.toLowerCase() ? term : undefined;
}

/**
 * Filters a loaded page the way a user expects a search box to behave.
 *
 * The server side of this is a *prefix* match - S3's ListBuckets has no
 * "contains" - so searching "production" server-side finds `production-eu` and
 * misses `my-production`, which is exactly the bucket someone typing that word
 * is usually looking for. Several S3-compatible providers ignore the parameter
 * altogether and return everything.
 *
 * So the server narrows and this decides what is shown. Pure and exported so
 * the rule can be tested on its own, and so nothing has to store a second,
 * derived copy of the list.
 */
export function filterBuckets(buckets: BucketOption[], searchTerm: string): BucketOption[] {
  const needle = searchTerm.trim().toLowerCase();

  // Returned as-is rather than copied: an unfiltered list is the common case,
  // and a fresh array every render would defeat every memo downstream.
  if (needle === '') return buckets;

  return buckets.filter((bucket) => bucket.name.toLowerCase().includes(needle));
}

const EMPTY_STATE = {
  owner: null,
  status: 'idle' as const,
  buckets: NO_BUCKETS,
  loadedFor: '',
  nextToken: undefined,
  isTruncated: false,
  isLoadingMore: false,
  error: null,
};

export const useBucketsStore = create<BucketsStore>((set, get) => ({
  ...EMPTY_STATE,

  /**
   * Loads the first page for `searchTerm`.
   *
   * Nothing calls this on mount, and nothing should: ListBuckets is a billed
   * request that the dashboard has no use for until someone actually opens the
   * switcher. `use-buckets` only reaches it once discovery has been asked for.
   *
   * `api` is passed in rather than held because it is the cache identity: a
   * list loaded for one provider means nothing to the next one, and taking it
   * per call makes that impossible to forget.
   */
  load: async (api, searchTerm, options) => {
    const term = searchTerm.trim();
    const state = get();

    if (!options?.force) {
      // Already answered, for this provider and this term. Reopening the
      // dropdown should not re-ask; `refresh` is how a caller insists.
      if (state.owner === api && state.status === 'ready' && state.loadedFor === term) {
        return;
      }

      // Already being asked. Join it rather than buying the same page twice -
      // see `inFlightLoad`.
      if (inFlightLoad && inFlightLoad.api === api && inFlightLoad.term === term) {
        return inFlightLoad.promise;
      }
    }

    const requestId = claimRequestId();

    // Cleared before the request, not after it. A search that is being
    // replaced must not keep showing the previous term's buckets while the new
    // ones are on their way, and a page-two request still in flight is retired
    // by the id it no longer holds.
    set({
      ...EMPTY_STATE,
      owner: api,
      status: 'loading',
      loadedFor: term,
    });

    const request = (async () => {
      try {
        const result = await api.getBuckets({
          searchTerm: serverSearchTerm(term),
          nextToken: undefined,
        });

        if (isSuperseded(requestId)) return;

        set({
          status: 'ready',
          buckets: toOptions(result.buckets),
          nextToken: result.nextToken,
          isTruncated: Boolean(result.isTruncated),
        });
      } catch (error) {
        if (isSuperseded(requestId)) return;

        // Never rethrown. A provider that cannot list buckets is a switcher
        // that has to ask for a name instead - it is not a broken session, and
        // nothing here is allowed to act as though it were.
        set({ status: 'error', error: describeDiscoveryFailure(error) });
      }
    })();

    inFlightLoad = { api, term, promise: request };

    try {
      await request;
    } finally {
      // Only if it is still ours: a forced load started meanwhile has taken
      // the slot, and clearing it would let the next caller issue a duplicate.
      if (inFlightLoad?.promise === request) inFlightLoad = null;
    }
  },

  /**
   * Fetches the next page and appends it.
   *
   * Whether there is a next page is the server's word - `isTruncated` and the
   * continuation token - and never the number of rows the client filter left
   * visible. A provider that ignores the search parameter can easily return a
   * page where nothing matches what the user typed, and concluding "no more
   * results" from that would strand the search on page one of a list whose
   * matches are all further down.
   */
  loadMore: async (api) => {
    const state = get();

    // Belongs to another provider, has nothing loaded, is already fetching, or
    // the server says this is the end. Each is a reason to do nothing.
    if (state.owner !== api) return;
    if (state.status !== 'ready') return;
    if (state.isLoadingMore) return;
    if (!state.isTruncated || state.nextToken === undefined) return;

    const requestId = claimRequestId();
    const token = state.nextToken;
    const term = state.loadedFor;

    set({ isLoadingMore: true });

    try {
      const result = await api.getBuckets({
        // Derived from the same stored term, so a page continues the request
        // that produced its token rather than changing the filter mid-list.
        searchTerm: serverSearchTerm(term),
        nextToken: token,
      });

      // A search started while this was in flight has already reset the whole
      // state, `isLoadingMore` included, so there is nothing to unwind here -
      // appending would put a page of the previous search's results under the
      // new one's.
      if (isSuperseded(requestId)) return;

      // A provider that ignores continuation tokens hands back the page we
      // already have, and one that echoes the request token back would have us
      // ask for it forever. Both end pagination here rather than looping.
      const repeated = result.nextToken !== undefined && result.nextToken === token;

      set((current) => ({
        buckets: appendPage(current.buckets, toOptions(result.buckets)),
        nextToken: repeated ? undefined : result.nextToken,
        isTruncated: repeated ? false : Boolean(result.isTruncated),
        isLoadingMore: false,
        // A page that worked answers the one that did not. Left behind, a
        // failed "load more" would keep an error on screen beside a list that
        // has just successfully grown.
        error: null,
      }));
    } catch (error) {
      if (isSuperseded(requestId)) return;

      // The pages already loaded are still good, so the status stays 'ready'
      // and the list stays on screen. Only the attempt to extend it failed.
      set({ isLoadingMore: false, error: describeDiscoveryFailure(error) });
    }
  },

  addBucket: (api, bucket) => {
    set((current) => {
      if (current.owner !== api) return current;
      if (current.buckets.some((existing) => existing.name === bucket.name)) return current;

      return { buckets: insertSorted(current.buckets, bucket) };
    });
  },

  removeBucket: (api, bucketName) => {
    set((current) => {
      if (current.owner !== api) return current;

      const remaining = current.buckets.filter((bucket) => bucket.name !== bucketName);

      // Same array back when nothing matched, so a delete of something this
      // page never listed does not re-render every subscriber for no change.
      return remaining.length === current.buckets.length ? current : { buckets: remaining };
    });
  },

  /**
   * Forgets everything, and retires any request still in flight so its
   * response cannot repopulate what was just cleared. Called when the S3
   * identity changes: another provider's buckets are not this one's.
   */
  reset: () => {
    claimRequestId();
    // Dropped as well as superseded: the response is already retired, and
    // leaving the slot behind would let the next caller join a request that
    // will deliberately write nothing.
    inFlightLoad = null;
    set({ ...EMPTY_STATE });
  },
}));
