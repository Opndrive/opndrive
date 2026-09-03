'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import {
  filterBuckets,
  useBucketsStore,
  type BucketOption,
  type BucketsError,
  type BucketsStatus,
} from '@/features/dashboard/stores/use-buckets-store';

/**
 * How long to wait after the last keystroke before asking the provider again.
 *
 * Shorter than the 500ms the main search bar uses, because that one navigates
 * and scans a bucket while this one refines a dropdown the user is looking at.
 * Long enough that typing a bucket name is one request rather than eleven.
 */
const SEARCH_DEBOUNCE_MS = 300;

export interface UseBucketsResult {
  /** What to render: the loaded page, narrowed by the search term. */
  buckets: BucketOption[];
  status: BucketsStatus;
  /** The first page is in flight. */
  isLoading: boolean;
  isLoadingMore: boolean;
  error: BucketsError | null;
  /**
   * This connection cannot list buckets, however often it is asked. The cue
   * for the switcher to offer a bucket name field instead of a list; it says
   * nothing about the session, which is still perfectly usable.
   */
  isDiscoveryUnavailable: boolean;
  /**
   * The server says more pages exist. Never derived from how many rows the
   * search left visible - see the store's `loadMore`.
   */
  hasMore: boolean;
  searchTerm: string;
  /** The bucket the session is on, read from auth. Not a second copy of it. */
  currentBucketName: string | null;
  setSearchTerm: (term: string) => void;
  /** Starts discovery. Until this is called, nothing is requested. */
  loadBuckets: () => void;
  loadMore: () => void;
  /** Re-asks for the current search term, ignoring what is already loaded. */
  refresh: () => void;
}

/**
 * Bucket discovery for the bucket switcher.
 *
 * Discovers, searches and paginates. It does not switch: selecting a bucket is
 * `useAuth().switchBucket`, which owns the active S3 identity outright. Nothing
 * here touches credentials, navigation, or the upload, drive and search state
 * that a switch tears down.
 *
 * Nothing is requested until `loadBuckets()` is called. Mounting this hook
 * issues no ListBuckets, which matters because the dashboard mounts the
 * switcher on every page while almost nobody opens it, and the call is billed.
 */
export function useBuckets(): UseBucketsResult {
  const { apiS3 } = useAuthGuard();

  // One selector per value. Subscribing to the whole store would re-render the
  // switcher on every field it does not read, including the ones that change
  // twice per request.
  const owner = useBucketsStore((state) => state.owner);
  const storedStatus = useBucketsStore((state) => state.status);
  const storedBuckets = useBucketsStore((state) => state.buckets);
  const storedError = useBucketsStore((state) => state.error);
  const isLoadingMore = useBucketsStore((state) => state.isLoadingMore);
  const isTruncated = useBucketsStore((state) => state.isTruncated);
  const nextToken = useBucketsStore((state) => state.nextToken);
  const load = useBucketsStore((state) => state.load);
  const loadMoreFromStore = useBucketsStore((state) => state.loadMore);
  const reset = useBucketsStore((state) => state.reset);

  /** What the input shows, and what the last request was actually made for. */
  const [searchTerm, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');

  /**
   * The provider discovery was asked for, or null while nobody has asked.
   *
   * This is what keeps discovery lazy: the effect below does nothing until a
   * caller has opened the switcher, so a mounted hook is inert.
   *
   * It holds the provider rather than a boolean so that a bucket switch turns
   * discovery off by arithmetic instead of by an effect. A flag would still
   * read `true` during the render that swapped the provider - state set from
   * one effect is not visible to the next one in the same pass - and the load
   * effect would fire a billed ListBuckets for a switcher nobody had opened.
   */
  const [discoveringFor, setDiscoveringFor] = useState<BYOS3ApiProvider | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownApi = useRef(apiS3);

  const setSearchTerm = useCallback((term: string) => {
    setTerm(term);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      setDebouncedTerm(term);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  /**
   * A new provider is a different account or a different bucket, and its list
   * has nothing to do with the one already loaded.
   *
   * This only tidies up - it frees the old list and puts the search box back
   * to empty. What actually stops a fresh ListBuckets going out for the new
   * provider is `discoveringFor` no longer matching it, which is true from the
   * render the swap happened in rather than from whenever this runs.
   *
   * Guarded on an actual change so remounting the hook does not throw away a
   * list it could still use.
   */
  useEffect(() => {
    if (knownApi.current === apiS3) return;

    knownApi.current = apiS3;

    // Cancelled, not just overwritten. A keystroke from a second ago has a
    // timer pending that would otherwise fire after the switch and set the
    // request term back to what was typed for the previous bucket - leaving an
    // empty search box that quietly searches for "prod" the next time the
    // switcher is opened.
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    setDiscoveringFor(null);
    setTerm('');
    setDebouncedTerm('');
    reset();
  }, [apiS3, reset]);

  useEffect(() => {
    if (!apiS3 || discoveringFor !== apiS3) return;

    void load(apiS3, debouncedTerm);
  }, [apiS3, discoveringFor, debouncedTerm, load]);

  const loadBuckets = useCallback(() => {
    if (!apiS3) return;

    setDiscoveringFor(apiS3);
  }, [apiS3]);

  const loadMore = useCallback(() => {
    if (!apiS3) return;

    void loadMoreFromStore(apiS3);
  }, [apiS3, loadMoreFromStore]);

  const refresh = useCallback(() => {
    if (!apiS3) return;

    setDiscoveringFor(apiS3);
    void load(apiS3, debouncedTerm, { force: true });
  }, [apiS3, debouncedTerm, load]);

  /**
   * Whether what the store holds belongs to the provider we are rendering for.
   *
   * Read rather than assumed, so a list loaded before a bucket switch cannot
   * be shown for even one frame afterwards - the reset above is an effect, and
   * effects run after the render that would have displayed them.
   */
  const isCurrent = owner === apiS3;

  const status: BucketsStatus = isCurrent ? storedStatus : 'idle';
  const error = isCurrent ? storedError : null;

  const buckets = useMemo(
    () => (isCurrent ? filterBuckets(storedBuckets, searchTerm) : []),
    [isCurrent, storedBuckets, searchTerm]
  );

  return {
    buckets,
    status,
    isLoading: status === 'loading',
    isLoadingMore: isCurrent && isLoadingMore,
    error,
    isDiscoveryUnavailable: error?.unavailable ?? false,
    hasMore: isCurrent && isTruncated && nextToken !== undefined,
    searchTerm,
    currentBucketName: apiS3?.getBucketName() ?? null,
    setSearchTerm,
    loadBuckets,
    loadMore,
    refresh,
  };
}
