import { create } from 'zustand';
import { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import { DataUnits, FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { BYOS3ApiProvider } from '@opndrive/s3-api';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
import { getParentPrefix } from '@/features/folder-navigation/folder-navigation';
import { classifyConnectionFailure, type ConnectionFailure } from '@/lib/s3/connection-failure';
import type { AsyncState } from '@/shared/components/ui/async-boundary';

type PrefixData = {
  files: FileItem[];
  folders: Folder[];
  nextToken?: string;
  isTruncated: boolean | undefined;
};

type RecentData = {
  files: FileItem[];
  folders: Folder[];
  hasMoreFiles: boolean;
  hasMoreFolders: boolean;
  fileOffset: number;
  folderOffset: number;
};

type RecentDataWithCache = RecentData & {
  _allFiles?: FileItem[];
  _allFolders?: Folder[];
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

type Store = {
  apiS3: BYOS3ApiProvider | null;
  setApiS3: (api: BYOS3ApiProvider) => void;
  cache: Record<string, PrefixData>;
  recentCache: Record<string, RecentDataWithCache>;
  status: Record<string, Status>;
  recentStatus: Record<string, Status>;
  loadMoreStatus: Record<string, Status>;
  /**
   * Why the last request for a key failed, one map per request kind.
   *
   * The catch blocks below used to be bare `catch {}`, so the reason was gone
   * before anyone could render it - which is half of why a failed listing was
   * indistinguishable from one still loading.
   *
   * Split the same way `status` and `recentStatus` are, and for a sharper
   * reason: `refreshCurrentData` runs both requests against the same prefix at
   * once. Sharing one map by prefix meant the directory listing succeeding
   * erased why the recent list had just failed, and the recent list then fell
   * back to a generic "something went wrong" - the exact vagueness this change
   * exists to remove. Each status setter owns its own map, so a status and its
   * reason cannot drift apart.
   */
  failures: Record<string, ConnectionFailure>;
  recentFailures: Record<string, ConnectionFailure>;
  currentPrefix: string | null;
  rootPrefix: string | null;

  setPrefixData: (prefix: string, data: PrefixData) => void;
  setRecentData: (prefix: string, data: RecentDataWithCache) => void;
  setCurrentPrefix: (prefix: string) => void;
  setStatus: (prefix: string, s: Status) => void;
  setRecentStatus: (prefix: string, s: Status) => void;
  setLoadMoreStatus: (prefix: string, s: Status) => void;
  setFailure: (prefix: string, failure: ConnectionFailure) => void;
  setRecentFailure: (prefix: string, failure: ConnectionFailure) => void;
  setRootPrefix: (prefix: string) => void;
  clearAllData: () => void;
  removeDeletedFolder: (prefix: string) => void;

  fetchData: (opts?: { sync?: boolean }) => Promise<void>;
  fetchRecentItems: (opts?: { sync?: boolean; itemsPerType?: number }) => Promise<void>;
  loadMoreRecentFiles: () => Promise<void>;
  loadMoreRecentFolders: () => Promise<void>;
  loadMoreData: () => Promise<void>;
  refreshCurrentData: () => Promise<void>;
  refreshAll: () => Promise<void>;
};

/**
 * Requests currently open, keyed by the cache key they will write to.
 *
 * Module scope rather than store state on purpose: every store write re-renders
 * subscribers, and a pending promise is not something any component renders.
 * `clearAllData` resets them so a new session cannot join a request issued by
 * the previous one.
 */
const inFlightFetches = new Map<string, Promise<void>>();
const inFlightRecentFetches = new Map<string, Promise<void>>();
const inFlightLoadMores = new Map<string, Promise<void>>();

/**
 * The newest request issued per cache key. A response is only written if it is
 * still the newest, so a slow request cannot land on top of a faster one issued
 * after it. Without this a refresh that overtakes an in-flight read gets undone
 * by that read, putting back rows the refresh had just removed.
 */
const latestRequestId = new Map<string, number>();
const latestRecentRequestId = new Map<string, number>();
const latestLoadMoreRequestId = new Map<string, number>();

/**
 * Global rather than per key, and never reset. Counting from zero per key meant
 * clearAllData could hand a new session's first request the same id an old
 * request was still holding, so the stale response read as current and wrote
 * the previous bucket's listing into the new session.
 */
let requestCounter = 0;

function claimRequestId(ids: Map<string, number>, key: string): number {
  requestCounter += 1;
  ids.set(key, requestCounter);
  return requestCounter;
}

function isSuperseded(ids: Map<string, number>, key: string, id: number): boolean {
  return ids.get(key) !== id;
}

/**
 * Retires every request open for `key`, used when a delete has just made the
 * bucket disagree with whatever those requests are about to return.
 *
 * Claiming a fresh id supersedes the responses still on their way, so they land
 * as no-ops instead of writing a listing read before the delete. Dropping the
 * in-flight entries then stops a later caller joining a request that will
 * deliberately write nothing.
 */
function discardOpenRequests(key: string): void {
  claimRequestId(latestRequestId, key);
  claimRequestId(latestRecentRequestId, key);
  claimRequestId(latestLoadMoreRequestId, key);

  inFlightFetches.delete(key);
  inFlightRecentFetches.delete(key);
  inFlightLoadMores.delete(key);
}

/**
 * Runs `work`, or joins the request already open for `key` when the caller is
 * happy with an in-flight result. A forced sync passes `reuseInFlight: false`
 * because the user asked for fresh data, not for whatever was already being
 * read before they asked.
 */
function runDeduped(
  inFlight: Map<string, Promise<void>>,
  key: string,
  reuseInFlight: boolean,
  work: () => Promise<void>
): Promise<void> {
  if (reuseInFlight) {
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const request = work().finally(() => {
    // Only ever clear our own entry; a later request may have replaced it.
    if (inFlight.get(key) === request) inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request;
}

/**
 * Appends `incoming` to `existing`, skipping anything already present by id.
 *
 * S3 pages do not overlap, so a repeat here means the same page was appended
 * twice. The visible symptom is every row of that page listed twice, with the
 * item count doubled to match. Returns `existing` untouched when there is
 * nothing to add, so an append that changes nothing does not re-render.
 */
function appendUnique<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((item) => item.id));

  const additions = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return additions.length > 0 ? [...existing, ...additions] : existing;
}

function enrichFolder(obj: CommonPrefix): Folder {
  const temp = obj.Prefix?.split('/');

  let name = undefined;

  if (temp && temp.length >= 2) {
    name = temp[temp.length - 2];
  }

  return {
    ...obj,
    id: obj.Prefix || `folder-${Date.now()}-${Math.random()}`,
    name: name ?? '',
    icon: 'folder',
    location: {
      type: 'my-drive',
      label: 'My Drive',
    },
  };
}

function formatBytes(bytes: number | undefined): { value: number; unit: DataUnits } {
  if (!bytes || bytes < 0) return { value: 0, unit: 'B' };

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return {
    value: parseFloat(size.toFixed(2)),
    unit: units[i] as DataUnits,
  };
}

function enrichFile(obj: _Object): FileItem {
  const temp = obj.Key?.split('/');

  let name = undefined;
  let ext = undefined;

  if (temp && temp.length >= 1) {
    name = temp[temp.length - 1];
    const fileNameSplit = name.split('.');
    ext = fileNameSplit[fileNameSplit.length - 1]?.toLowerCase();
  }

  return {
    ...obj,
    id: obj.Key || `file-${Date.now()}-${Math.random()}`,
    name: name ?? '',
    extension: ext ?? 'unknown',
    size: formatBytes(obj.Size),
    lastModified: obj.LastModified ? new Date(obj.LastModified) : undefined,
  };
}

/** The store keys the root listing as '/', everything else by its own prefix. */
function toCacheKey(prefix: string): string {
  return prefix === '' ? '/' : prefix;
}

function isUnder(key: string | undefined, prefix: string): boolean {
  return typeof key === 'string' && key.startsWith(prefix);
}

/**
 * A listing with everything under `prefix` taken out. Used on the parent of a
 * deleted folder, so walking back up shows what is really there without
 * waiting for a refetch that may not happen at all.
 */
function withoutPrefix(data: PrefixData, prefix: string): PrefixData {
  return {
    ...data,
    folders: data.folders.filter((folder) => !isUnder(folder.Prefix, prefix)),
    files: data.files.filter((file) => !isUnder(file.Key, prefix)),
  };
}

function recentWithoutPrefix(data: RecentDataWithCache, prefix: string): RecentDataWithCache {
  const files = data.files.filter((file) => !isUnder(file.Key, prefix));
  const folders = data.folders.filter((folder) => !isUnder(folder.Prefix, prefix));
  const allFiles = data._allFiles?.filter((file) => !isUnder(file.Key, prefix));
  const allFolders = data._allFolders?.filter((folder) => !isUnder(folder.Prefix, prefix));

  return {
    ...data,
    files,
    folders,
    _allFiles: allFiles,
    _allFolders: allFolders,
    // The offsets mark how far into the sorted list the visible slice reaches,
    // so they move with it. Left alone, "View more" would skip an item for
    // every one removed ahead of them.
    fileOffset: files.length,
    folderOffset: folders.length,
    hasMoreFiles: (allFiles?.length ?? files.length) > files.length,
    hasMoreFolders: (allFolders?.length ?? folders.length) > folders.length,
  };
}

export const useDriveStore = create<Store>((set, get) => ({
  apiS3: null,
  cache: {},
  recentCache: {},
  status: {},
  recentStatus: {},
  loadMoreStatus: {},
  failures: {},
  recentFailures: {},
  rootPrefix: null,
  currentPrefix: null,

  setApiS3: (api) => set({ apiS3: api }),

  setPrefixData: (prefix, data) =>
    set((state) => ({
      cache: { ...state.cache, [prefix]: data },
    })),

  setRecentData: (prefix, data) =>
    set((state) => ({
      recentCache: { ...state.recentCache, [prefix]: data },
    })),

  setStatus: (prefix, s) =>
    set((state) => {
      // A key that is loading or ready has no current failure. Leaving the old
      // one behind would let a retry that succeeded still render its reason.
      const failures = { ...state.failures };
      if (s !== 'error') delete failures[prefix];

      return { status: { ...state.status, [prefix]: s }, failures };
    }),

  setFailure: (prefix, failure) =>
    set((state) => ({ failures: { ...state.failures, [prefix]: failure } })),

  setRecentFailure: (prefix, failure) =>
    set((state) => ({ recentFailures: { ...state.recentFailures, [prefix]: failure } })),

  setRecentStatus: (prefix, s) =>
    set((state) => {
      const recentFailures = { ...state.recentFailures };
      if (s !== 'error') delete recentFailures[prefix];

      return { recentStatus: { ...state.recentStatus, [prefix]: s }, recentFailures };
    }),

  setLoadMoreStatus: (prefix, s) =>
    set((state) => ({ loadMoreStatus: { ...state.loadMoreStatus, [prefix]: s } })),

  setRootPrefix: (prefix) => set({ rootPrefix: prefix }),

  setCurrentPrefix: (prefix) => set({ currentPrefix: prefix }),

  clearAllData: () => {
    // Drop the request bookkeeping with the data it describes. A new session
    // must not join a request issued by the previous one, and leaving the ids
    // behind would let a response from the old session still count as current.
    inFlightFetches.clear();
    inFlightRecentFetches.clear();
    inFlightLoadMores.clear();
    latestRequestId.clear();
    latestRecentRequestId.clear();
    latestLoadMoreRequestId.clear();

    set({
      apiS3: null,
      cache: {},
      recentCache: {},
      status: {},
      recentStatus: {},
      loadMoreStatus: {},
      failures: {},
      recentFailures: {},
      currentPrefix: null,
      rootPrefix: null,
    });
  },

  /**
   * Forgets a folder that no longer exists in the bucket.
   *
   * refreshCurrentData only ever refetches the folder the user is standing in,
   * so every other cached listing keeps describing the bucket as it was. Delete
   * a folder from somewhere deep inside it and the listings above stay behind,
   * still offering a folder that is gone until the page is reloaded.
   */
  removeDeletedFolder: (prefix) => {
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;

    // '/' is the root. A folder delete never means "drop the whole bucket".
    if (normalized === '/' || normalized === '') return;

    const parentKey = toCacheKey(getParentPrefix(normalized));
    const current = get();

    // The folder and everything it held, across every map that is keyed by
    // prefix. These listings describe objects that are not there any more, so
    // they cannot be shown again.
    const gone = new Set<string>();
    for (const map of [
      current.cache,
      current.recentCache,
      current.status,
      current.recentStatus,
      current.loadMoreStatus,
    ]) {
      for (const key of Object.keys(map)) {
        if (isUnder(key, normalized)) gone.add(key);
      }
    }

    // A read issued before the delete is still on its way, and it would write
    // the folder back: over the parent it was just pruned from, and over the
    // prefix itself, where a resurrected entry reads as ready and gets served
    // to whoever walks back into it.
    for (const key of gone) discardOpenRequests(key);
    discardOpenRequests(parentKey);

    set((state) => {
      const cache = { ...state.cache };
      const recentCache = { ...state.recentCache };
      const status = { ...state.status };
      const recentStatus = { ...state.recentStatus };
      const loadMoreStatus = { ...state.loadMoreStatus };

      for (const key of gone) {
        delete cache[key];
        delete recentCache[key];
        delete status[key];
        delete recentStatus[key];
        delete loadMoreStatus[key];
      }

      // The parent keeps its listing, minus the folder that just went away.
      // Dropping it outright would leave whoever is looking at it staring at a
      // skeleton, since a fetch only fires when the prefix changes.
      const parent = cache[parentKey];
      if (parent) cache[parentKey] = withoutPrefix(parent, normalized);

      const parentRecent = recentCache[parentKey];
      if (parentRecent) recentCache[parentKey] = recentWithoutPrefix(parentRecent, normalized);

      // A request retired above never writes, which includes the status it set
      // on its way out. Anything the parent had in flight would sit on
      // 'loading' for good: a listing stuck behind its skeleton, and a "Show
      // more" that refuses to run again because it thinks one is still going.
      // What is already cached is what there is to show, so say so.
      if (status[parentKey] === 'loading') {
        if (cache[parentKey]) status[parentKey] = 'ready';
        else delete status[parentKey];
      }
      if (recentStatus[parentKey] === 'loading') {
        if (recentCache[parentKey]) recentStatus[parentKey] = 'ready';
        else delete recentStatus[parentKey];
      }
      if (loadMoreStatus[parentKey] === 'loading') delete loadMoreStatus[parentKey];

      return { cache, recentCache, status, recentStatus, loadMoreStatus };
    });

    // The search cache is deliberately left alone. clearCache also drops the
    // query being viewed, and the results list is derived from it, so a delete
    // started from a search result would blank the whole page the user is
    // reading. A cached query that still lists the folder goes stale on its own
    // TTL, which is the smaller problem of the two.
  },

  fetchData: async (opts = { sync: false }) => {
    const {
      apiS3,
      currentPrefix,
      rootPrefix,
      status,
      cache,
      setPrefixData,
      setStatus,
      setFailure,
    } = get();

    if (!apiS3) return;

    // Ensure prefixes are available first
    if (currentPrefix === null || rootPrefix === null) return;

    // Normalize the key used for both cache and status
    // When both are '/', we use an empty prefix for the API, but '/' as the key in our store
    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    // Avoid duplicate concurrent fetches unless forced by sync
    const currStatus = status[keyPrefix];

    if (currStatus === 'ready' && !opts.sync) return;

    const currentData = cache[keyPrefix];

    // Data already present and nobody asked for fresh; just reflect it.
    // Don't auto-refetch just because isTruncated is true - let the user decide
    // with the "Show More" button.
    if (currentData && !opts.sync) {
      if (currStatus !== 'ready') setStatus(keyPrefix, 'ready');
      return;
    }

    // Join a request already open for this key rather than issuing a second
    // identical one. Navigating A -> B -> A did exactly that: A's first request
    // is still 'loading' rather than 'ready', so the status check above let it
    // through, and cache[A] was still empty, so the data check did too.
    return runDeduped(inFlightFetches, keyPrefix, !opts.sync, async () => {
      const requestId = claimRequestId(latestRequestId, keyPrefix);

      try {
        setStatus(keyPrefix, 'loading');

        // Always read from the top. This branch only runs when there is no data
        // yet or a sync was forced, and either way the result replaces the cache
        // wholesale - so passing the stored continuation token would have
        // replaced a fully paged folder with nothing but its last page.
        const data = await apiS3.fetchDirectoryStructure(formattedPrefix, 1000);

        if (isSuperseded(latestRequestId, keyPrefix, requestId)) return;

        data.folders = data.folders.filter((obj) => obj.Prefix != '');
        data.files = data.files.filter((obj) => obj.Key != formattedPrefix);

        setPrefixData(keyPrefix, {
          files: data.files.map((obj) => enrichFile(obj)),
          folders: data.folders.map((obj) => enrichFolder(obj)),
          nextToken: data.nextToken,
          isTruncated: data.isTruncated,
        });
        setStatus(keyPrefix, 'ready');
      } catch (error) {
        // A superseded request must not report an error over a newer request's
        // result, or a folder that loaded fine renders as failed.
        if (isSuperseded(latestRequestId, keyPrefix, requestId)) return;

        // Recorded before the status, because setStatus('error') is what a
        // subscriber wakes on - setting it first would render one frame with
        // no reason to show.
        setFailure(keyPrefix, classifyConnectionFailure(error));
        setStatus(keyPrefix, 'error');
      }
    });
  },

  refreshCurrentData: async () => {
    const { fetchData, fetchRecentItems, currentPrefix, rootPrefix } = get();

    // Only refresh if we have valid prefixes set
    if (currentPrefix !== null && rootPrefix !== null) {
      // Invalidate search cache for current prefix since data is being refreshed
      useSearchStore.getState().invalidatePrefix(currentPrefix);

      // Refresh both regular cache and recent cache in parallel
      await Promise.all([
        fetchData({ sync: true }),
        fetchRecentItems({ sync: true, itemsPerType: 10 }),
      ]);
    }
  },

  refreshAll: async () => {
    const { fetchData, fetchRecentItems, currentPrefix, rootPrefix } = get();

    // Only refresh if we have valid prefixes set
    if (currentPrefix !== null && rootPrefix !== null) {
      // Clear entire search cache since we're refreshing all data
      useSearchStore.getState().clearCache();

      // Refresh both regular cache and recent cache in parallel
      await Promise.all([
        fetchData({ sync: true }),
        fetchRecentItems({ sync: true, itemsPerType: 10 }),
      ]);
    }
  },

  fetchRecentItems: async (opts = { sync: false, itemsPerType: 10 }) => {
    const {
      apiS3,
      currentPrefix,
      rootPrefix,
      recentStatus,
      recentCache,
      setRecentData,
      setRecentStatus,
      setRecentFailure,
    } = get();

    if (!apiS3) return;

    if (currentPrefix === null || rootPrefix === null) return;

    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    const currStatus = recentStatus[keyPrefix];
    if (currStatus === 'ready' && !opts.sync) return;

    // Ensure itemsPerType has a default value
    const itemsPerType = opts.itemsPerType ?? 10;

    // Same A -> B -> A race as fetchData: 'loading' is not 'ready', so
    // returning to a folder whose recent-items request is still open used to
    // fire a second identical one.
    return runDeduped(inFlightRecentFetches, keyPrefix, !opts.sync, async () => {
      const requestId = claimRequestId(latestRecentRequestId, keyPrefix);

      try {
        setRecentStatus(keyPrefix, 'loading');

        // Fetch up to 1000 items from current directory
        const data = await apiS3.fetchDirectoryStructure(formattedPrefix, 1000);

        if (isSuperseded(latestRecentRequestId, keyPrefix, requestId)) return;

        data.folders = data.folders.filter((obj) => obj.Prefix != '');
        data.files = data.files.filter((obj) => obj.Key != formattedPrefix);

        const folders = data.folders.map((obj) => enrichFolder(obj));
        const files = data.files.map((obj) => enrichFile(obj));

        // Sort by lastModified in descending order (most recent first)
        // Note: Folders from CommonPrefix don't have LastModified, so we'll use creation time as fallback
        const sortedFolders = folders.sort((a, b) => {
          const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return bTime - aTime;
        });

        const sortedFiles = files.sort((a, b) => {
          const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return bTime - aTime;
        });

        // Take only the requested number initially
        const recentData: RecentDataWithCache = {
          files: sortedFiles.slice(0, itemsPerType),
          folders: sortedFolders.slice(0, itemsPerType),
          hasMoreFiles: sortedFiles.length > itemsPerType,
          hasMoreFolders: sortedFolders.length > itemsPerType,
          fileOffset: itemsPerType,
          folderOffset: itemsPerType,
        };

        // Store all sorted data for pagination (keeping full sorted arrays in memory temporarily)
        const existingCache = recentCache[keyPrefix];
        if (!existingCache || opts.sync) {
          // Store full sorted arrays for pagination access
          recentData._allFiles = sortedFiles;
          recentData._allFolders = sortedFolders;
        }

        setRecentData(keyPrefix, recentData);
        setRecentStatus(keyPrefix, 'ready');
      } catch (error) {
        if (isSuperseded(latestRecentRequestId, keyPrefix, requestId)) return;

        setRecentFailure(keyPrefix, classifyConnectionFailure(error));
        setRecentStatus(keyPrefix, 'error');
      }
    });
  },

  loadMoreRecentFiles: async () => {
    const { currentPrefix, rootPrefix, recentCache, setRecentData } = get();

    if (currentPrefix === null || rootPrefix === null) return;

    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    const existingData = recentCache[keyPrefix];
    if (!existingData || !existingData.hasMoreFiles) return;

    const allFiles = existingData._allFiles || [];
    const nextBatch = allFiles.slice(existingData.fileOffset, existingData.fileOffset + 10);

    const updatedData: RecentDataWithCache = {
      ...existingData,
      files: [...existingData.files, ...nextBatch],
      fileOffset: existingData.fileOffset + 10,
      hasMoreFiles: existingData.fileOffset + 10 < allFiles.length,
    };

    setRecentData(keyPrefix, updatedData);
  },

  loadMoreRecentFolders: async () => {
    const { currentPrefix, rootPrefix, recentCache, setRecentData } = get();

    if (currentPrefix === null || rootPrefix === null) return;

    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    const existingData = recentCache[keyPrefix];
    if (!existingData || !existingData.hasMoreFolders) return;

    const allFolders = existingData._allFolders || [];
    const nextBatch = allFolders.slice(existingData.folderOffset, existingData.folderOffset + 10);

    const updatedData: RecentDataWithCache = {
      ...existingData,
      folders: [...existingData.folders, ...nextBatch],
      folderOffset: existingData.folderOffset + 10,
      hasMoreFolders: existingData.folderOffset + 10 < allFolders.length,
    };

    setRecentData(keyPrefix, updatedData);
  },

  loadMoreData: async () => {
    const {
      apiS3,
      currentPrefix,
      rootPrefix,
      cache,
      loadMoreStatus,
      setPrefixData,
      setLoadMoreStatus,
    } = get();

    if (!apiS3) return;
    if (currentPrefix === null || rootPrefix === null) return;

    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    const currentData = cache[keyPrefix];

    // Only load more if we have existing data and it's truncated
    if (!currentData || !currentData.isTruncated || !currentData.nextToken) {
      return;
    }

    // Don't load if already loading
    if (loadMoreStatus[keyPrefix] === 'loading') return;

    // The status check above only holds because nothing awaits between reading
    // it and setting it below. Joining an open request keeps two clicks landing
    // on the same page from both fetching it even if that ever changes.
    return runDeduped(inFlightLoadMores, keyPrefix, true, async () => {
      const token = currentData.nextToken;
      const requestId = claimRequestId(latestLoadMoreRequestId, keyPrefix);

      try {
        setLoadMoreStatus(keyPrefix, 'loading');

        const data = await apiS3.fetchDirectoryStructure(formattedPrefix, 1000, token);

        // clearAllData drops these ids, so a page requested before a logout
        // reads as superseded here. Checking the cache alone would not be
        // enough: connect to a different bucket and open the same prefix, and
        // the cache is populated again by the time this lands, so the previous
        // bucket's page would be appended to the new bucket's listing.
        if (isSuperseded(latestLoadMoreRequestId, keyPrefix, requestId)) return;

        data.folders = data.folders.filter((obj) => obj.Prefix != '');
        data.files = data.files.filter((obj) => obj.Key != formattedPrefix);

        // Append to what the cache holds now, not to the snapshot taken before
        // the await. A refresh landing meanwhile replaces the cache, and
        // appending to the stale copy would put back whatever it removed.
        const latest = get().cache[keyPrefix];
        if (!latest) return;

        setPrefixData(keyPrefix, {
          files: appendUnique(
            latest.files,
            data.files.map((obj) => enrichFile(obj))
          ),
          folders: appendUnique(
            latest.folders,
            data.folders.map((obj) => enrichFolder(obj))
          ),
          nextToken: data.nextToken,
          isTruncated: data.isTruncated,
        });
        setLoadMoreStatus(keyPrefix, 'ready');
      } catch (error) {
        if (isSuperseded(latestLoadMoreRequestId, keyPrefix, requestId)) return;
        setLoadMoreStatus(keyPrefix, 'error');
        console.error('Failed to load more data:', error);
      }
    });
  },
}));

/**
 * The directory listing for the folder the user is standing in, as one value
 * that cannot be read without deciding what a failure looks like.
 *
 * The store keeps status, data and failure in three separate maps, which is
 * fine for writing but is exactly what let both dashboard pages write
 * `status[prefix] === 'ready' ? rows : skeleton` and silently render a failed
 * listing as a skeleton forever. Narrowing happens here once, so a page reaches
 * `data` only through the branch that has any.
 */
export function useDirectoryState(): AsyncState<PrefixData> {
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const status = useDriveStore((state) =>
    currentPrefix ? state.status[currentPrefix] : undefined
  );
  const data = useDriveStore((state) => (currentPrefix ? state.cache[currentPrefix] : undefined));
  const failure = useDriveStore((state) =>
    currentPrefix ? state.failures[currentPrefix] : undefined
  );
  const fetchData = useDriveStore((state) => state.fetchData);

  return toAsyncState(status, data, failure, () => void fetchData({ sync: true }));
}

/** The same, for the recent-items list on the dashboard home. */
export function useRecentState(): AsyncState<RecentDataWithCache> {
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const status = useDriveStore((state) =>
    currentPrefix ? state.recentStatus[currentPrefix] : undefined
  );
  const data = useDriveStore((state) =>
    currentPrefix ? state.recentCache[currentPrefix] : undefined
  );
  const failure = useDriveStore((state) =>
    currentPrefix ? state.recentFailures[currentPrefix] : undefined
  );
  const fetchRecentItems = useDriveStore((state) => state.fetchRecentItems);

  return toAsyncState(status, data, failure, () => void fetchRecentItems({ sync: true }));
}

function toAsyncState<T>(
  status: Status | undefined,
  data: T | undefined,
  failure: ConnectionFailure | undefined,
  retry: () => void
): AsyncState<T> {
  if (status === 'error') {
    // A key can be marked failed a frame before its reason is recorded, and an
    // 'unknown' failure still tells the user more than a skeleton would.
    return { state: 'error', failure: failure ?? classifyConnectionFailure(undefined), retry };
  }

  // Data without a ready status is a folder being re-synced: it has rows on
  // screen already, and blanking them back to a skeleton mid-refresh would be
  // a worse answer than showing what is there.
  if (data !== undefined) return { state: 'ready', data };

  return status === 'loading' ? { state: 'loading' } : { state: 'idle' };
}
