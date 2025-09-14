import { create } from 'zustand';
import { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import { DataUnits, FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { BYOS3ApiProvider } from '@opndrive/s3-api';

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

  fetchData: (opts?: { sync?: boolean }) => Promise<void>;
  fetchRecentItems: (opts?: { sync?: boolean; itemsPerType?: number }) => Promise<void>;
  loadMoreRecentFiles: () => Promise<void>;
  loadMoreRecentFolders: () => Promise<void>;
  loadMoreData: () => Promise<void>;
  refreshCurrentData: () => Promise<void>;
  refreshAll: () => Promise<void>;
};

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
    ext = fileNameSplit[fileNameSplit.length - 1];
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

    // Decide whether we should fetch
    if (!currentData || opts.sync || currentData.isTruncated) {
      try {
        setStatus(keyPrefix, 'loading');

        const data = await apiS3.fetchDirectoryStructure(
          formattedPrefix,
          1000,
          currentData?.nextToken
        );

        data.folders = data.folders.filter((obj) => obj.Prefix != '');
        data.files = data.files.filter((obj) => obj.Key != formattedPrefix);
        const folders = data.folders.map((obj) => enrichFolder(obj));
        const files = data.files.map((obj) => enrichFile(obj));

        const nextData =
          currentData && !opts.sync
            ? {
                files: [...currentData.files, ...files],
                folders: [...currentData.folders, ...folders],
                nextToken: data.nextToken,
                isTruncated: data.isTruncated,
              }
            : {
                files: [...files],
                folders: [...folders],
                nextToken: data.nextToken,
                isTruncated: data.isTruncated,
              };
        // Data loaded successfully
        setPrefixData(keyPrefix, nextData);
        setStatus(keyPrefix, 'ready');
      } catch {
        // Handle fetch error
        setStatus(keyPrefix, 'error');
      }
    } else {
      // Data already present; ensure status reflects it
      if (currStatus !== 'ready') setStatus(keyPrefix, 'ready');
    }
  },

  refreshCurrentData: async () => {
    const { fetchData, fetchRecentItems, currentPrefix, rootPrefix } = get();

    // Only refresh if we have valid prefixes set
    if (currentPrefix !== null && rootPrefix !== null) {
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

    try {
      setRecentStatus(keyPrefix, 'loading');

      // Fetch up to 1000 items from current directory
      const data = await apiS3.fetchDirectoryStructure(formattedPrefix, 1000);

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
      setRecentStatus(keyPrefix, 'error');
    }
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

    try {
      setLoadMoreStatus(keyPrefix, 'loading');

      const data = await apiS3.fetchDirectoryStructure(
        formattedPrefix,
        1000,
        currentData.nextToken
      );

      data.folders = data.folders.filter((obj) => obj.Prefix != '');
      data.files = data.files.filter((obj) => obj.Key != formattedPrefix);
      const folders = data.folders.map((obj) => enrichFolder(obj));
      const files = data.files.map((obj) => enrichFile(obj));

      // Append new data to existing data
      const nextData = {
        files: [...currentData.files, ...files],
        folders: [...currentData.folders, ...folders],
        nextToken: data.nextToken,
        isTruncated: data.isTruncated,
      };

      setPrefixData(keyPrefix, nextData);
      setLoadMoreStatus(keyPrefix, 'ready');
    } catch (error) {
      setLoadMoreStatus(keyPrefix, 'error');
      console.error('Failed to load more data:', error);
    }
  },
}));
