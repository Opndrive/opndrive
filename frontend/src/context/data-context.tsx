import { useMemo } from 'react';
import { create } from 'zustand';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
import { getParentPrefix } from '@/features/folder-navigation/folder-navigation';
import { classifyConnectionFailure } from '@/lib/s3/connection-failure';
import type { AsyncState } from '@/shared/components/ui/async-boundary';
import {
  type FolderListing,
  appendPage,
  emptyListing,
  enrichFile,
  enrichFolder,
  fileKey,
  folderKey,
  keysToEvict,
  mergeFirstPage,
  newestFirst,
  replacingFile,
  toPage,
  withFile,
  withFolder,
  withoutFolder,
  withoutKeys,
  withoutPrefix,
} from './folder-listing';

export type { FolderListing } from './folder-listing';

/** Entries per request: S3's maximum, so a folder takes as few round trips as it can. */
export const PAGE_SIZE = 1000;

type Store = {
  apiS3: BYOS3ApiProvider | null;
  setApiS3: (api: BYOS3ApiProvider) => void;
  /**
   * One listing per folder, keyed '/' for the bucket root and by prefix
   * otherwise. The only copy of what the drive shows: browse, the home page's
   * suggestions and the file preview all read from here.
   */
  listings: Record<string, FolderListing>;
  currentPrefix: string | null;
  rootPrefix: string | null;

  /** Leaving a folder cancels whatever it was still reading. */
  setCurrentPrefix: (prefix: string) => void;
  setRootPrefix: (prefix: string) => void;
  /** Forgets every listing and stops every read: on bucket switch and disconnect. */
  clearAllData: () => void;
  removeDeletedFolder: (prefix: string) => void;

  /**
   * Localized edits, for when an operation has already told us what changed.
   *
   * Each one rewrites the affected listing in place and returns the inverse of
   * what it did, so a caller whose request then fails can put things back.
   *
   * The revert is an inverse operation and not a restored snapshot on purpose.
   * Restoring the array a row sat in would also restore every other row a
   * concurrent operation had removed from it meanwhile - delete two files while
   * an upload is in flight, let the upload fail, and both deleted files come
   * back. Applying the inverse touches only what this call touched.
   */
  removeFiles: (keys: readonly string[]) => Revert;
  addFile: (prefix: string, file: OptimisticFile) => Revert;
  addFolder: (prefix: string, name: string) => Revert;
  renameFile: (oldKey: string, newKey: string) => Revert;
  renameFolder: (prefix: string, newName: string) => Revert;

  /**
   * Reads the first page of the folder on screen.
   *
   * A folder with rows already cached shows them at once and re-reads page 1
   * quietly. `sync` re-reads even so; `silent` re-reads without announcing it -
   * no 'loading' on the way in, and no 'error' over rows still on screen.
   */
  fetchData: (opts?: { sync?: boolean; silent?: boolean }) => Promise<void>;
  /** Reads the page after the loaded ones, for `prefix` or the folder on screen. */
  loadMoreData: (prefix?: string) => Promise<void>;
  refreshCurrentData: (opts?: { silent?: boolean }) => Promise<void>;
  refreshAll: () => Promise<void>;
  /** Remembers where a folder was scrolled to, for coming back to it. */
  rememberScrollOffset: (prefix: string, offset: number) => void;
};

/** Undoes one optimistic change by applying its inverse. */
export type Revert = () => void;

/** Nothing changed, so there is nothing to undo. */
const NO_REVERT: Revert = () => {};

/** What an optimistic insert knows about a file before S3 has confirmed it. */
export type OptimisticFile = {
  key: string;
  size?: number;
  lastModified?: Date;
};

type SetState = (updater: (state: Store) => Partial<Store>) => void;
type GetState = () => Store;

// ---------------------------------------------------------------------------
// Requests: one at a time per folder, cancellable
// ---------------------------------------------------------------------------

type OpenRequest = {
  kind: 'first' | 'next';
  id: number;
  controller: AbortController;
  promise: Promise<void>;
};

/**
 * The request open for each folder, at most one.
 *
 * One, because two would race: a page appended from a cursor a refresh has
 * since replaced, or a refresh landing under a page that was meant to follow
 * it. A new first-page read replaces whatever was open; a next-page read waits
 * its turn behind a first-page read.
 *
 * Module scope rather than store state: a pending promise is not something any
 * component renders, and every store write re-renders subscribers.
 */
const openRequests = new Map<string, OpenRequest>();

/**
 * Global and never reset. Counting from zero per folder meant clearAllData
 * could hand a new session's first request the id an old one still held, so
 * the stale response read as current.
 */
let requestCounter = 0;

/**
 * When a folder was last used, for the recent-folders cap.
 *
 * A clock that never repeats rather than `Date.now()` alone. Two folders used
 * within the same millisecond tied, and eviction then chose between them
 * arbitrarily - sometimes dropping the folder the user had just gone back to.
 */
let lastUse = 0;
function nextUse(): number {
  lastUse = Math.max(lastUse + 1, Date.now());
  return lastUse;
}

function isCurrent(key: string, id: number): boolean {
  return openRequests.get(key)?.id === id;
}

function startRequest(
  key: string,
  kind: OpenRequest['kind'],
  work: (id: number, signal: AbortSignal) => Promise<void>
): Promise<void> {
  requestCounter += 1;
  const id = requestCounter;
  const controller = new AbortController();

  const open: OpenRequest = { kind, id, controller, promise: Promise.resolve() };
  openRequests.set(key, open);

  open.promise = work(id, controller.signal).finally(() => {
    // Only ever clear our own entry; a later request may have replaced it.
    if (openRequests.get(key)?.id === id) openRequests.delete(key);
  });

  return open.promise;
}

/** Stops the request open for `key`, if any. Its answer, if it comes, is ignored. */
function abortOpen(key: string): boolean {
  const open = openRequests.get(key);
  if (!open) return false;

  open.controller.abort();
  openRequests.delete(key);
  return true;
}

/**
 * A listing's statuses after the request that set them was stopped. A stopped
 * request never writes again, so a 'loading' it left would be permanent: a
 * skeleton that never resolves, or a next page that never starts.
 */
function settled(listing: FolderListing): FolderListing {
  const status =
    listing.status === 'loading' ? (listing.loaded ? 'ready' : 'idle') : listing.status;
  const nextPage =
    listing.nextPage.status === 'loading' ? { status: 'idle' as const } : listing.nextPage;

  return status === listing.status && nextPage === listing.nextPage
    ? listing
    : { ...listing, status, nextPage };
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** The store keys the bucket root as '/', everything else by its own prefix. */
function toCacheKey(prefix: string): string {
  return prefix === '' ? '/' : prefix;
}

/** The prefix S3 is asked for, for a cache key. */
function apiPrefixOf(key: string): string {
  return key === '/' ? '' : key;
}

/** The cache key of the folder on screen, or null before one is chosen. */
function currentKey(state: Pick<Store, 'currentPrefix' | 'rootPrefix'>): string | null {
  const { currentPrefix, rootPrefix } = state;
  if (currentPrefix === null || rootPrefix === null) return null;

  return toCacheKey(rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix);
}

function ensureTrailingSlash(prefix: string): string {
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function isUnder(key: string, prefix: string): boolean {
  return key.startsWith(prefix);
}

/** Groups object keys by the cache key of the listing that holds them. */
function groupKeysByPrefix(keys: readonly string[]): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();

  for (const key of keys) {
    const cacheKey = toCacheKey(getParentPrefix(key));
    const group = groups.get(cacheKey);

    if (group) group.add(key);
    else groups.set(cacheKey, new Set([key]));
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Writing listings
// ---------------------------------------------------------------------------

/** Writes one listing, creating it empty if it does not exist yet. */
function writeListing(
  set: SetState,
  key: string,
  change: (listing: FolderListing) => FolderListing
): void {
  set((state) => {
    const before = state.listings[key] ?? emptyListing(nextUse());
    const after = change(before);
    return after === state.listings[key] ? {} : { listings: { ...state.listings, [key]: after } };
  });
}

/**
 * Forgets the least recently used listings past the cap, never the folder on
 * screen, and stops anything they were still reading.
 */
function evictLeastRecent(set: SetState, get: GetState): void {
  const state = get();
  const evicted = keysToEvict(state.listings, currentKey(state));
  if (evicted.length === 0) return;

  for (const key of evicted) abortOpen(key);

  set((current) => {
    const listings = { ...current.listings };
    for (const key of evicted) delete listings[key];
    return { listings };
  });
}

/**
 * Applies one change to a folder's listing, as a single write.
 *
 * The listing is read inside the update rather than from a snapshot, so two
 * operations landing in the same tick compose instead of overwriting one
 * another. A read already in the air describes the folder as it was before
 * this change and would land on top of it, so it is stopped.
 */
function applyToListing(
  set: SetState,
  get: GetState,
  key: string,
  change: (listing: FolderListing) => FolderListing
): void {
  const current = get().listings[key];

  // Every transform returns its argument when it matched nothing, so a change
  // aimed at one folder never hands the others' subscribers a new object.
  const changesRows = current?.loaded === true && change(current) !== current;
  const stranded = current !== undefined && settled(current) !== current;
  const hasOpenRequest = openRequests.has(key);

  if (!changesRows && !stranded && !hasOpenRequest) return;

  abortOpen(key);

  set((state) => {
    const listing = state.listings[key];
    if (!listing) return {};

    return {
      listings: { ...state.listings, [key]: settled(listing.loaded ? change(listing) : listing) },
    };
  });

  // Cached search results for this prefix now list something that is gone, or
  // miss something that is there. invalidatePrefix drops only those entries.
  useSearchStore.getState().invalidatePrefix(key);
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const useDriveStore = create<Store>((set, get) => ({
  apiS3: null,
  listings: {},
  rootPrefix: null,
  currentPrefix: null,

  setApiS3: (api) => set({ apiS3: api }),

  setRootPrefix: (prefix) => set({ rootPrefix: prefix }),

  setCurrentPrefix: (prefix) => {
    const state = get();
    const next = currentKey({ currentPrefix: prefix, rootPrefix: state.rootPrefix }) ?? prefix;

    // Leaving a folder cancels what it was still reading. Its rows stay cached
    // for coming back; a page that never arrived is read again then.
    const left = [...openRequests.keys()].filter((key) => key !== next);
    for (const key of left) abortOpen(key);

    set((current) => {
      const listings = { ...current.listings };
      for (const key of left) {
        const listing = listings[key];
        if (listing) listings[key] = settled(listing);
      }

      const shown = listings[next];
      if (shown) listings[next] = { ...shown, lastUsed: nextUse() };

      return { currentPrefix: prefix, listings };
    });
  },

  clearAllData: () => {
    // Stop every read with the data it would have written. A response from the
    // previous session must never land in the next one.
    for (const key of [...openRequests.keys()]) abortOpen(key);

    set({ apiS3: null, listings: {}, currentPrefix: null, rootPrefix: null });
  },

  rememberScrollOffset: (prefix, offset) => {
    const key = toCacheKey(prefix);
    const listing = get().listings[key];
    if (!listing || listing.scrollOffset === offset) return;

    writeListing(set, key, (current) => ({ ...current, scrollOffset: offset }));
  },

  /**
   * Forgets a folder that no longer exists in the bucket, and everything cached
   * beneath it, and takes its row out of the parent.
   */
  removeDeletedFolder: (prefix) => {
    const normalized = ensureTrailingSlash(prefix);

    // '/' is the root. A folder delete never means "drop the whole bucket".
    if (normalized === '/' || normalized === '') return;

    const parentKey = toCacheKey(getParentPrefix(normalized));
    const gone = Object.keys(get().listings).filter((key) => isUnder(key, normalized));

    // A read issued before the delete would write the folder back: over the
    // parent it was just pruned from, and over the prefix itself.
    for (const key of [...openRequests.keys()]) {
      if (isUnder(key, normalized)) abortOpen(key);
    }
    abortOpen(parentKey);

    set((state) => {
      const listings = { ...state.listings };
      for (const key of gone) delete listings[key];

      // The parent keeps its listing, minus the folder that went away.
      // Dropping it outright would leave whoever is looking at it staring at a
      // skeleton, since a fetch only fires when the prefix changes.
      const parent = listings[parentKey];
      if (parent) listings[parentKey] = settled(withoutPrefix(parent, normalized));

      return { listings };
    });

    // The search cache is deliberately left alone: clearCache would also drop
    // the query being viewed, blanking a search page the delete started from.
  },

  removeFiles: (keys) => {
    if (keys.length === 0) return NO_REVERT;

    const groups = groupKeysByPrefix(keys);

    // The rows themselves, read before the removal, so the revert puts back
    // exactly what this call took out and nothing else.
    const removed: { prefix: string; file: FileItem }[] = [];
    const { listings } = get();

    for (const [prefix, group] of groups) {
      for (const file of listings[prefix]?.files ?? []) {
        if (group.has(fileKey(file))) removed.push({ prefix, file });
      }
    }

    for (const [prefix, group] of groups) {
      applyToListing(set, get, prefix, (listing) => withoutKeys(listing, group));
    }

    if (removed.length === 0) return NO_REVERT;

    return () => {
      for (const { prefix, file } of removed) {
        applyToListing(set, get, prefix, (listing) => withFile(listing, file, true));
      }
    };
  },

  addFile: (prefix, file) => {
    const key = toCacheKey(prefix);

    // The same shape a listing would have given, built from what the upload
    // knows. An absent timestamp means now: the object was just written.
    const item = enrichFile({
      Key: file.key,
      Size: file.size,
      LastModified: file.lastModified ?? new Date(),
    });

    // An upload that replaced an object finds it listed already, so this call
    // added nothing - and an undo that removed it would take out a real row.
    const alreadyListed = (get().listings[key]?.files ?? []).some(
      (existing) => fileKey(existing) === file.key
    );

    applyToListing(set, get, key, (listing) => withFile(listing, item));

    if (alreadyListed) return NO_REVERT;

    return () => {
      applyToListing(set, get, key, (listing) => withoutKeys(listing, new Set([file.key])));
    };
  },

  addFolder: (prefix, name) => {
    const parentKey = toCacheKey(prefix);
    const folderPrefix = `${prefix === '/' ? '' : prefix}${name}/`;
    const folder = enrichFolder({ Prefix: folderPrefix });

    // As in addFile: creating over a folder already listed adds nothing.
    const alreadyListed = (get().listings[parentKey]?.folders ?? []).some(
      (existing) => folderKey(existing) === folderPrefix
    );

    applyToListing(set, get, parentKey, (listing) => withFolder(listing, folder));

    if (alreadyListed) return NO_REVERT;

    return () => {
      applyToListing(set, get, parentKey, (listing) => withoutFolder(listing, folderPrefix));
    };
  },

  renameFile: (oldKey, newKey) => {
    const prefix = toCacheKey(getParentPrefix(oldKey));
    const existing = get().listings[prefix]?.files.find((file) => fileKey(file) === oldKey);

    // Nothing cached to rename; the listing will arrive already correct.
    if (!existing) return NO_REVERT;

    // Size, timestamp and ETag survive a rename; the key, name, extension and
    // id are read back off the new key. The enriched size and date are put
    // back explicitly, since a row built anywhere but a listing may lack the
    // raw S3 fields enrichFile reads them from.
    const renamed: FileItem = {
      ...enrichFile({ ...existing, Key: newKey }),
      size: existing.size,
      lastModified: existing.lastModified,
    };

    // Renaming onto a row already listed (the "replace" answer) adds nothing,
    // so the undo must not remove the row that was there first.
    const targetOccupied = (get().listings[prefix]?.files ?? []).some(
      (file) => fileKey(file) === newKey
    );

    // Out and back in rather than in place: the new name sorts elsewhere.
    const swap = (from: FileItem, to: FileItem) => {
      applyToListing(set, get, prefix, (listing) => replacingFile(listing, fileKey(from), to));
    };

    swap(existing, renamed);

    if (targetOccupied) {
      return () => {
        applyToListing(set, get, prefix, (listing) => withFile(listing, existing, true));
      };
    }

    return () => swap(renamed, existing);
  },

  renameFolder: (prefix, newName) => {
    const normalized = ensureTrailingSlash(prefix);

    // '/' is the root, which is not a folder anyone can rename.
    if (normalized === '/' || normalized === '') return NO_REVERT;

    const parent = getParentPrefix(normalized);
    const parentKey = toCacheKey(parent);
    const existing = get().listings[parentKey]?.folders.find(
      (folder) => folderKey(folder) === normalized
    );

    // Every listing cached under the old prefix describes objects that have
    // moved, so they go with the row. They are re-read on the next visit.
    get().removeDeletedFolder(normalized);
    const undoAdd = get().addFolder(parent, newName);

    return () => {
      undoAdd();

      if (existing) {
        applyToListing(set, get, parentKey, (listing) => withFolder(listing, existing, true));
      }
    };
  },

  fetchData: async (opts = {}) => {
    const state = get();
    const { apiS3 } = state;
    const key = currentKey(state);

    if (!apiS3 || key === null) return;

    const force = opts.sync === true || opts.silent === true;
    const open = openRequests.get(key);
    const listing = state.listings[key];

    if (!force) {
      // A first page already on its way is the answer to this call too:
      // navigating A -> B -> A must not read A twice.
      if (open?.kind === 'first') return open.promise;

      // Coming back to a folder: its rows show at once, and page 1 is read
      // again quietly in case anything changed while it was away.
      if (listing?.loaded) return loadFirstPage(set, get, apiS3, key, true);
    }

    return loadFirstPage(set, get, apiS3, key, opts.silent === true);
  },

  loadMoreData: async (prefix) => {
    const state = get();
    const { apiS3 } = state;
    const key = prefix === undefined ? currentKey(state) : toCacheKey(prefix);
    if (!apiS3 || key === null) return;

    const listing = state.listings[key];
    if (!listing?.loaded || listing.complete || !listing.cursor) return;

    // One request at a time: a page already being read is this one; a first
    // page being read goes first, and the caller asks again after it.
    const open = openRequests.get(key);
    if (open) return open.kind === 'next' ? open.promise : undefined;

    const token = listing.cursor;

    return startRequest(key, 'next', async (id, signal) => {
      writeListing(set, key, (current) => ({ ...current, nextPage: { status: 'loading' } }));

      try {
        const raw = await apiS3.fetchDirectoryStructure(apiPrefixOf(key), PAGE_SIZE, token, {
          signal,
        });

        // A cleared session, a refresh or a change in this folder stopped this
        // request, and its page belongs to a listing that no longer exists.
        if (!isCurrent(key, id)) return;

        const latest = get().listings[key];
        if (!latest?.loaded || latest.cursor !== token) {
          if (latest) writeListing(set, key, settled);
          return;
        }

        // Appended to what the listing holds now, not to the snapshot taken
        // before the await: a change landing meanwhile is kept.
        writeListing(set, key, (current) => ({
          ...appendPage(current, toPage(raw, apiPrefixOf(key))),
          nextPage: { status: 'idle' },
          lastUsed: nextUse(),
        }));
        evictLeastRecent(set, get);
      } catch (error) {
        if (!isCurrent(key, id)) return;

        // The rows already loaded stay exactly as they are: only the next page
        // failed, and it can be asked for again.
        writeListing(set, key, (current) => ({
          ...current,
          nextPage: { status: 'error', failure: classifyConnectionFailure(error) },
        }));
      }
    });
  },

  refreshCurrentData: async (opts) => {
    const key = currentKey(get());
    if (key === null) return;

    // Cached search results for this folder go stale with the refresh.
    useSearchStore.getState().invalidatePrefix(key);
    await get().fetchData({ sync: true, silent: opts?.silent });
  },

  refreshAll: async () => {
    if (currentKey(get()) === null) return;

    useSearchStore.getState().clearCache();
    await get().fetchData({ sync: true });
  },
}));

/**
 * Reads page 1 of a folder and lays it over what is cached: see mergeFirstPage.
 * Replaces any request open for the folder - a page from before this read would
 * follow a cursor it is about to replace.
 */
function loadFirstPage(
  set: SetState,
  get: GetState,
  apiS3: BYOS3ApiProvider,
  key: string,
  silent: boolean
): Promise<void> {
  if (abortOpen(key)) writeListing(set, key, settled);

  return startRequest(key, 'first', async (id, signal) => {
    // A silent read leaves the status alone: 'loading' only means anything
    // with nothing to show, and this one runs over a listing already up.
    if (!silent) {
      writeListing(set, key, (current) => ({ ...current, status: 'loading', failure: undefined }));
    }

    try {
      const raw = await apiS3.fetchDirectoryStructure(apiPrefixOf(key), PAGE_SIZE, undefined, {
        signal,
      });

      if (!isCurrent(key, id)) return;

      writeListing(set, key, (current) => ({
        ...mergeFirstPage(current, toPage(raw, apiPrefixOf(key))),
        status: 'ready',
        failure: undefined,
        nextPage: { status: 'idle' },
        lastUsed: nextUse(),
      }));
      evictLeastRecent(set, get);
    } catch (error) {
      // A superseded or stopped request must not report an error over a newer
      // request's result, or a folder that loaded fine renders as failed.
      if (!isCurrent(key, id)) return;

      // Neither may a silent read over rows on screen: a background read that
      // failed changes nothing the user is looking at.
      if (silent && get().listings[key]?.loaded) {
        writeListing(set, key, settled);
        return;
      }

      writeListing(set, key, (current) => ({
        ...current,
        status: 'error',
        failure: classifyConnectionFailure(error),
      }));
    }
  });
}

// ---------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------

/** The listing of the folder on screen, or undefined before it has one. */
export function useCurrentListing(): FolderListing | undefined {
  return useDriveStore((state) => {
    const key = currentKey(state);
    return key === null ? undefined : state.listings[key];
  });
}

/**
 * The folder on screen as one value that cannot be read without deciding what
 * a failure looks like. Narrowing happens here once, so a page reaches the rows
 * only through the branch that has any.
 */
export function useDirectoryState(): AsyncState<FolderListing> {
  const listing = useCurrentListing();
  const fetchData = useDriveStore((state) => state.fetchData);

  return toAsyncState(listing, listing, () => void fetchData({ sync: true }));
}

/** What the home page shows: built from the folder's own listing, not a copy of it. */
export type RecentItems = {
  folders: Folder[];
  files: FileItem[];
  hasMoreFolders: boolean;
  hasMoreFiles: boolean;
  /** Whether the suggestions come from the whole folder or only its loaded part. */
  complete: boolean;
  /** How many entries they were chosen from. */
  loadedCount: number;
};

/**
 * The home page's suggestions: the newest files and the first folders among
 * what is loaded. S3 cannot say which files are newest without the whole
 * folder, so `complete` tells the page whether to say "among the first N".
 */
export function useRecentState(fileLimit = 10, folderLimit = 10): AsyncState<RecentItems> {
  const listing = useCurrentListing();
  const fetchData = useDriveStore((state) => state.fetchData);
  const files = listing?.files;
  const sorted = useMemo(() => (files ? newestFirst(files) : []), [files]);

  const data: RecentItems | undefined = listing?.loaded
    ? {
        files: sorted.slice(0, fileLimit),
        folders: listing.folders.slice(0, folderLimit),
        hasMoreFiles: sorted.length > fileLimit,
        hasMoreFolders: listing.folders.length > folderLimit,
        complete: listing.complete,
        loadedCount: listing.folders.length + listing.files.length,
      }
    : undefined;

  return toAsyncState(listing, data, () => void fetchData({ sync: true }));
}

function toAsyncState<T>(
  listing: FolderListing | undefined,
  data: T | undefined,
  retry: () => void
): AsyncState<T> {
  if (listing?.status === 'error') {
    return {
      state: 'error',
      failure: listing.failure ?? classifyConnectionFailure(undefined),
      retry,
    };
  }

  // Rows without a ready status are a folder being re-read: blanking them back
  // to a skeleton mid-refresh would be a worse answer than showing them.
  if (listing?.loaded && data !== undefined) return { state: 'ready', data };

  return listing?.status === 'loading' ? { state: 'loading' } : { state: 'idle' };
}
