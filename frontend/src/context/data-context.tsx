import { create } from 'zustand';
import { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import { DataUnits, FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { BYOS3ApiProvider } from '@opndrive/s3-api';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';

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
  currentPrefix: string | null;
  rootPrefix: string | null;

  setPrefixData: (prefix: string, data: PrefixData) => void;
  setRecentData: (prefix: string, data: RecentDataWithCache) => void;
  setCurrentPrefix: (prefix: string) => void;
  setStatus: (prefix: string, s: Status) => void;
  setRecentStatus: (prefix: string, s: Status) => void;
  setLoadMoreStatus: (prefix: string, s: Status) => void;
  setRootPrefix: (prefix: string) => void;
  clearAllData: () => void;

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

export const useDriveStore = create<Store>((set, get) => ({
  apiS3: null,
  cache: {},
  recentCache: {},
  status: {},
  recentStatus: {},
  loadMoreStatus: {},
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

  setStatus: (prefix, s) => set((state) => ({ status: { ...state.status, [prefix]: s } })),

  setRecentStatus: (prefix, s) =>
    set((state) => ({ recentStatus: { ...state.recentStatus, [prefix]: s } })),

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

    set({
      apiS3: null,
      cache: {},
      recentCache: {},
      status: {},
      recentStatus: {},
      loadMoreStatus: {},
      currentPrefix: null,
      rootPrefix: null,
    });
  },

  fetchData: async (opts = { sync: false }) => {
    const { apiS3, currentPrefix, rootPrefix, status, cache, setPrefixData, setStatus } = get();

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
      } catch {
        // A superseded request must not report an error over a newer request's
        // result, or a folder that loaded fine renders as failed.
        if (isSuperseded(latestRequestId, keyPrefix, requestId)) return;
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
      } catch {
        if (isSuperseded(latestRecentRequestId, keyPrefix, requestId)) return;
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

      try {
        setLoadMoreStatus(keyPrefix, 'loading');

        const data = await apiS3.fetchDirectoryStructure(formattedPrefix, 1000, token);

        data.folders = data.folders.filter((obj) => obj.Prefix != '');
        data.files = data.files.filter((obj) => obj.Key != formattedPrefix);

        // Append to what the cache holds now, not to the snapshot taken before
        // the await. A refresh landing meanwhile replaces the cache, and
        // appending to the stale copy would put back whatever it removed.
        const latest = get().cache[keyPrefix];
        if (!latest) {
          // Logout or a folder change wiped it while this was open.
          setLoadMoreStatus(keyPrefix, 'ready');
          return;
        }

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
        setLoadMoreStatus(keyPrefix, 'error');
        console.error('Failed to load more data:', error);
      }
    });
  },
}));
