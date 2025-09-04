import { create } from 'zustand';
import { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import { apiS3 } from '@/services/byo-s3-api';
import { DataUnits, FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';

type PrefixData = {
  files: FileItem[];
  folders: Folder[];
  nextToken?: string;
  isTruncated: boolean | undefined;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

type Store = {
  cache: Record<string, PrefixData>;
  status: Record<string, Status>;
  currentPrefix: string | null;
  rootPrefix: string | null;

  setPrefixData: (prefix: string, data: PrefixData) => void;
  setCurrentPrefix: (prefix: string) => void;
  setStatus: (prefix: string, s: Status) => void;
  setRootPrefix: (prefix: string) => void;

  fetchData: (opts?: { sync?: boolean }) => Promise<void>;
  refreshCurrentData: () => Promise<void>;
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
  };
}

export const useDriveStore = create<Store>((set, get) => ({
  cache: {},
  status: {},
  rootPrefix: null,
  currentPrefix: null,

  setPrefixData: (prefix, data) =>
    set((state) => ({
      cache: { ...state.cache, [prefix]: data },
    })),

  setStatus: (prefix, s) => set((state) => ({ status: { ...state.status, [prefix]: s } })),

  setRootPrefix: (prefix) => set({ rootPrefix: prefix }),

  setCurrentPrefix: (prefix) => set({ currentPrefix: prefix }),

  fetchData: async (opts = { sync: false }) => {
    const { currentPrefix, rootPrefix, status, cache, setPrefixData, setStatus } = get();

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
    const { fetchData, currentPrefix, rootPrefix } = get();

    // Only refresh if we have valid prefixes set
    if (currentPrefix !== null && rootPrefix !== null) {
      await fetchData({ sync: true });
    }
  },
}));
