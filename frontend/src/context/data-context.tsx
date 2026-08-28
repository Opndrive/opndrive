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

/**
 * One request's outcome, held as a single value.
 *
 * Status and reason used to live in separate maps keyed by the same prefix, and
 * nothing forced them to agree. That is not theoretical: with one shared
 * failures map, the directory listing finishing erased why the recent list had
 * failed, and the recent list fell back to a generic "something went wrong".
 * Splitting the map per request kind fixed that instance without fixing the
 * shape - four maps that must stay in step are still four maps that can fall
 * out of step.
 *
 * Together they cannot drift: a reason is only ever written with the status it
 * explains, and replacing the status replaces the reason with it.
 */
type RequestState = {
  status: Status;
  /** Only meaningful with status 'error'. Cleared by any other status. */
  failure?: ConnectionFailure;
};

type Store = {
  apiS3: BYOS3ApiProvider | null;
  setApiS3: (api: BYOS3ApiProvider) => void;
  cache: Record<string, PrefixData>;
  recentCache: Record<string, RecentDataWithCache>;
  directory: Record<string, RequestState>;
  recent: Record<string, RequestState>;
  loadMoreStatus: Record<string, Status>;
  currentPrefix: string | null;
  rootPrefix: string | null;

  setPrefixData: (prefix: string, data: PrefixData) => void;
  setRecentData: (prefix: string, data: RecentDataWithCache) => void;
  setCurrentPrefix: (prefix: string) => void;
  /** Writes a status and its reason as one value. */
  setDirectoryState: (prefix: string, status: Status, failure?: ConnectionFailure) => void;
  setRecentState: (prefix: string, status: Status, failure?: ConnectionFailure) => void;
  setLoadMoreStatus: (prefix: string, s: Status) => void;
  setRootPrefix: (prefix: string) => void;
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
   * `silent` re-reads a prefix without announcing it: no 'loading' on the way
   * in, and no 'error' on the way out over rows that are still on screen. For
   * refreshing something the user is already looking at.
   */
  fetchData: (opts?: { sync?: boolean; silent?: boolean }) => Promise<void>;
  fetchRecentItems: (opts?: {
    sync?: boolean;
    silent?: boolean;
    itemsPerType?: number;
  }) => Promise<void>;
  loadMoreRecentFiles: () => Promise<void>;
  loadMoreRecentFolders: () => Promise<void>;
  loadMoreData: () => Promise<void>;
  refreshCurrentData: (opts?: { silent?: boolean }) => Promise<void>;
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
    kind: 'folder',
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
    kind: 'file',
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

/** Undoes one optimistic change by applying its inverse. */
export type Revert = () => void;

/** Nothing changed, so there is nothing to undo. */
const NO_REVERT: Revert = () => {};

/** The zustand setter, narrowed to the functional form these helpers require. */
type SetState = (updater: (state: Store) => Partial<Store>) => void;

type GetState = () => Store;

/** What an optimistic insert knows about a file before S3 has confirmed it. */
export type OptimisticFile = {
  key: string;
  size?: number;
  lastModified?: Date;
};

function fileKey(file: FileItem): string {
  return file.Key ?? file.id;
}

function folderKey(folder: Folder): string {
  return folder.Prefix ?? folder.id;
}

function fileTime(file: FileItem): number {
  return file.lastModified ? file.lastModified.getTime() : 0;
}

function ensureTrailingSlash(prefix: string): string {
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

/**
 * A listing with the named objects taken out, matched by whole key.
 *
 * Deliberately not `withoutPrefix`. That matches with startsWith, which is what
 * a folder needs and what a file must never get: removing "report.pdf" by
 * prefix takes "report.pdf.bak" with it.
 */
function withoutKeys(data: PrefixData, keys: ReadonlySet<string>): PrefixData {
  const files = data.files.filter((file) => !keys.has(fileKey(file)));

  // Returning the same object when nothing matched is what stops a change
  // aimed at one folder from re-rendering every other one.
  if (files.length === data.files.length) return data;

  // nextToken and isTruncated describe where the server's cursor stopped, not
  // what we are holding, so filtering locally leaves both alone.
  return { ...data, files };
}

function recentWithoutKeys(
  data: RecentDataWithCache,
  keys: ReadonlySet<string>
): RecentDataWithCache {
  const files = data.files.filter((file) => !keys.has(fileKey(file)));
  const allFiles = data._allFiles?.filter((file) => !keys.has(fileKey(file)));

  if (files.length === data.files.length && allFiles?.length === data._allFiles?.length) {
    return data;
  }

  return {
    ...data,
    files,
    _allFiles: allFiles,
    // The rule recentWithoutPrefix follows: the offset marks how far the
    // visible window reaches, so it moves with the window. Left behind, "View
    // more" skips an item for every one removed ahead of it.
    fileOffset: files.length,
    hasMoreFiles: allFiles ? allFiles.length > files.length : data.hasMoreFiles,
  };
}

/** Index for `key` in a list held in S3's lexicographic order. */
function sortedIndex<T>(items: readonly T[], key: string, keyOf: (item: T) => string): number {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (keyOf(items[mid]!) < key) low = mid + 1;
    else high = mid;
  }

  return low;
}

/**
 * Where a new object belongs in a listing, or null when it belongs to a page
 * nobody has fetched.
 *
 * A truncated listing holds only the pages read so far. An object sorting past
 * the last of them is not missing from the view - it is in a page the user has
 * not asked for yet. Putting it in anyway strands it there for good: when that
 * page does arrive, `appendUnique` finds the key already present and drops the
 * real object, leaving the guess standing in its place.
 */
function insertionIndex<T>(
  items: readonly T[],
  key: string,
  keyOf: (item: T) => string,
  isTruncated: boolean | undefined
): number | null {
  const last = items[items.length - 1];
  if (isTruncated && last && keyOf(last) < key) return null;

  return sortedIndex(items, key, keyOf);
}

function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/**
 * @param restoring true when putting back a row this session took out.
 *
 * The truncation guard is about objects we have never had in the listing. A row
 * that was in it a moment ago belongs in it still - and once it has been
 * removed, the key after it becomes the last one, so the guard would refuse to
 * put back the very row it was asked to restore. That is a rollback silently
 * losing the last file of a folder with more than a thousand objects in it.
 */
function withFile(data: PrefixData, file: FileItem, restoring = false): PrefixData {
  const key = fileKey(file);

  // Already listed: an upload that overwrote an existing object, or a revert
  // running twice. Either way the row is there, and adding it would double it.
  if (data.files.some((existing) => fileKey(existing) === key)) return data;

  const at = insertionIndex(data.files, key, fileKey, restoring ? false : data.isTruncated);
  if (at === null) return data;

  return { ...data, files: insertAt(data.files, file, at) };
}

/**
 * One row swapped for another.
 *
 * The truncation guard is deliberately bypassed. This is not a new object
 * arriving from S3 - it is one the listing was already showing, under another
 * name - and the guard cannot tell the difference: taking the old row out moves
 * the last loaded key backwards, so renaming the last row of a truncated folder
 * looks to it like an object from an unfetched page and it refuses to place it.
 * A rename would then read as a deletion.
 *
 * The cost of bypassing it: in a truncated folder, a name that really does sort
 * into an unfetched page is shown here anyway, and when that page arrives
 * `appendUnique` finds the key already present and keeps this row instead. The
 * row carries the object's real size and timestamp, so what is left is a sort
 * position that is wrong until the next full read - which is a far smaller
 * problem than the file appearing to have been deleted.
 */
function replacingFile(data: PrefixData, fromKey: string, to: FileItem): PrefixData {
  return withFile(withoutKeys(data, new Set([fromKey])), to, true);
}

/** `restoring` as in withFile, for the same reason. */
function withFolder(data: PrefixData, folder: Folder, restoring = false): PrefixData {
  const key = folderKey(folder);
  if (data.folders.some((existing) => folderKey(existing) === key)) return data;

  const at = insertionIndex(data.folders, key, folderKey, restoring ? false : data.isTruncated);
  if (at === null) return data;

  return { ...data, folders: insertAt(data.folders, folder, at) };
}

/**
 * A listing with one folder row taken out, matched by whole prefix.
 *
 * The row only - nothing cached *under* the folder. Dropping that is
 * removeDeletedFolder's job, and it is not what an undo wants.
 */
function withoutFolder(data: PrefixData, prefix: string): PrefixData {
  const folders = data.folders.filter((folder) => folderKey(folder) !== prefix);
  if (folders.length === data.folders.length) return data;

  return { ...data, folders };
}

/** Position for `file` in a list held newest-first. */
function newestFirstIndex(files: readonly FileItem[], file: FileItem): number {
  const time = fileTime(file);
  const at = files.findIndex((existing) => fileTime(existing) < time);

  return at === -1 ? files.length : at;
}

/**
 * The recent list with one file added, to both the window on screen and the
 * pagination source behind it.
 *
 * `files` is a window onto `_allFiles`; adding to one and not the other makes
 * "View more" hand back a list that disagrees with what is showing. A file
 * older than everything on screen goes only into the source, where "View more"
 * reaches it in its proper place.
 */
function recentWithFile(data: RecentDataWithCache, file: FileItem): RecentDataWithCache {
  const key = fileKey(file);
  if (data.files.some((existing) => fileKey(existing) === key)) return data;
  if (data._allFiles?.some((existing) => fileKey(existing) === key)) return data;

  const allFiles = data._allFiles
    ? insertAt(data._allFiles, file, newestFirstIndex(data._allFiles, file))
    : undefined;

  // With no pagination source there is no "behind the window" to fall into, so
  // everything shows.
  const oldestVisible = data.files[data.files.length - 1];
  const belongsOnScreen =
    !allFiles || oldestVisible === undefined || fileTime(file) >= fileTime(oldestVisible);

  const files = belongsOnScreen
    ? insertAt(data.files, file, newestFirstIndex(data.files, file))
    : data.files;

  return {
    ...data,
    files,
    _allFiles: allFiles,
    fileOffset: files.length,
    hasMoreFiles: allFiles ? allFiles.length > files.length : data.hasMoreFiles,
  };
}

/**
 * The same for a folder, inserted in lexicographic order.
 *
 * Recent folders arrive from S3 in that order and stay in it: a CommonPrefix
 * carries no LastModified, so the sort in fetchRecentItems has nothing to move
 * them by and leaves them as they came.
 */
function recentWithFolder(data: RecentDataWithCache, folder: Folder): RecentDataWithCache {
  const key = folderKey(folder);
  if (data.folders.some((existing) => folderKey(existing) === key)) return data;
  if (data._allFolders?.some((existing) => folderKey(existing) === key)) return data;

  const allFolders = data._allFolders
    ? insertAt(data._allFolders, folder, sortedIndex(data._allFolders, key, folderKey))
    : undefined;

  const at = sortedIndex(data.folders, key, folderKey);
  const belongsOnScreen = !allFolders || at < data.folders.length || !data.hasMoreFolders;

  const folders = belongsOnScreen ? insertAt(data.folders, folder, at) : data.folders;

  return {
    ...data,
    folders,
    _allFolders: allFolders,
    folderOffset: folders.length,
    hasMoreFolders: allFolders ? allFolders.length > folders.length : data.hasMoreFolders,
  };
}

function recentWithoutFolder(data: RecentDataWithCache, prefix: string): RecentDataWithCache {
  const folders = data.folders.filter((folder) => folderKey(folder) !== prefix);
  const allFolders = data._allFolders?.filter((folder) => folderKey(folder) !== prefix);

  if (folders.length === data.folders.length && allFolders?.length === data._allFolders?.length) {
    return data;
  }

  return {
    ...data,
    folders,
    _allFolders: allFolders,
    folderOffset: folders.length,
    hasMoreFolders: allFolders ? allFolders.length > folders.length : data.hasMoreFolders,
  };
}

/** The five prefix-keyed maps, as the copies a functional update is building. */
type StatusMaps = {
  cache: Record<string, PrefixData>;
  recentCache: Record<string, RecentDataWithCache>;
  directory: Record<string, RequestState>;
  recent: Record<string, RequestState>;
  loadMoreStatus: Record<string, Status>;
};

/**
 * Puts a key's statuses back to something a view can act on, after
 * `discardOpenRequests` has retired whatever was running for it.
 *
 * A retired request returns without writing, and the status it set on the way
 * in is part of what it never writes. Left alone that is permanent: a listing
 * behind a skeleton that never resolves, and a "Show more" that refuses to run
 * again because it still reads as loading. What is cached is what there is to
 * show, so say so.
 *
 * Mutates the maps it is handed.
 */
function repairStrandedStatus(key: string, maps: StatusMaps): void {
  if (maps.directory[key]?.status === 'loading') {
    if (maps.cache[key]) maps.directory[key] = { status: 'ready' };
    else delete maps.directory[key];
  }

  if (maps.recent[key]?.status === 'loading') {
    if (maps.recentCache[key]) maps.recent[key] = { status: 'ready' };
    else delete maps.recent[key];
  }

  if (maps.loadMoreStatus[key] === 'loading') delete maps.loadMoreStatus[key];
}

/**
 * Applies one change to a prefix's two listings, as a single write.
 *
 * Both listings are read from `state` inside the update rather than from a
 * snapshot taken beforehand, so two operations landing in the same tick compose
 * instead of overwriting one another - the lesson loadMoreData records about
 * appending to a stale copy, applied to every mutation rather than only that
 * one.
 *
 * No status is written. The rows are already right, and writing 'loading' is
 * what puts a folder behind a skeleton when it has nothing cached to show.
 */
function applyToPrefix(
  set: SetState,
  get: GetState,
  key: string,
  changeDirectory: (data: PrefixData) => PrefixData,
  changeRecent: (data: RecentDataWithCache) => RecentDataWithCache
): void {
  const current = get();

  // Every transform here returns its argument untouched when it matched
  // nothing, which is the whole point of that convention: a delete in one
  // folder must not hand the subscribers of every other folder a new store
  // object. Writing unconditionally would do exactly that, since the write
  // rebuilds all five maps whether or not anything in them moved.
  //
  // Reading state to decide whether to write is safe precisely here: this
  // function is synchronous start to finish, so nothing can land between the
  // read and the write the way it can across an await.
  const directoryData = current.cache[key];
  const recentData = current.recentCache[key];

  const changesRows =
    (directoryData !== undefined && changeDirectory(directoryData) !== directoryData) ||
    (recentData !== undefined && changeRecent(recentData) !== recentData);

  const strandedStatus =
    current.directory[key]?.status === 'loading' ||
    current.recent[key]?.status === 'loading' ||
    current.loadMoreStatus[key] === 'loading';

  // An open request is a reason to write even when no row moved, and it is not
  // the same question as whether anything is cached. Delete a file from a
  // folder being listed for the very first time and there is nothing cached to
  // change - but that listing is still on its way, still describing the file as
  // present, and retiring it is the only thing standing between the user and
  // watching the row come back.
  const hasOpenRequest =
    inFlightFetches.has(key) || inFlightRecentFetches.has(key) || inFlightLoadMores.has(key);

  if (!changesRows && !strandedStatus && !hasOpenRequest) return;

  // A read issued before this change is about to describe the prefix as it was,
  // and it would land on top of what we are writing. Retiring it here turns it
  // into a no-op when it arrives.
  discardOpenRequests(key);

  set((state) => {
    const cache = { ...state.cache };
    const recentCache = { ...state.recentCache };
    const directory = { ...state.directory };
    const recent = { ...state.recent };
    const loadMoreStatus = { ...state.loadMoreStatus };

    const directoryData = cache[key];
    const recentData = recentCache[key];

    if (directoryData) cache[key] = changeDirectory(directoryData);
    if (recentData) recentCache[key] = changeRecent(recentData);

    repairStrandedStatus(key, { cache, recentCache, directory, recent, loadMoreStatus });

    return { cache, recentCache, directory, recent, loadMoreStatus };
  });

  // Cached search results for this prefix now list something that is gone, or
  // miss something that is there. invalidatePrefix drops only those entries;
  // clearCache would blank a search page the user is reading.
  useSearchStore.getState().invalidatePrefix(key);
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

export const useDriveStore = create<Store>((set, get) => ({
  apiS3: null,
  cache: {},
  recentCache: {},
  directory: {},
  recent: {},
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

  setDirectoryState: (prefix, status, failure) =>
    set((state) => ({
      // The reason travels with the status, so a stale one cannot outlive the
      // failure it describes - a retry that succeeded used to keep rendering it.
      directory: { ...state.directory, [prefix]: { status, failure } },
    })),

  setRecentState: (prefix, status, failure) =>
    set((state) => ({
      recent: { ...state.recent, [prefix]: { status, failure } },
    })),

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
      directory: {},
      recent: {},
      loadMoreStatus: {},
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
      current.directory,
      current.recent,
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
      const directory = { ...state.directory };
      const recent = { ...state.recent };
      const loadMoreStatus = { ...state.loadMoreStatus };

      for (const key of gone) {
        delete cache[key];
        delete recentCache[key];
        delete directory[key];
        delete recent[key];
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
      // 'loading' for good.
      repairStrandedStatus(parentKey, { cache, recentCache, directory, recent, loadMoreStatus });

      return { cache, recentCache, directory, recent, loadMoreStatus };
    });

    // The search cache is deliberately left alone. clearCache also drops the
    // query being viewed, and the results list is derived from it, so a delete
    // started from a search result would blank the whole page the user is
    // reading. A cached query that still lists the folder goes stale on its own
    // TTL, which is the smaller problem of the two.
  },

  removeFiles: (keys) => {
    if (keys.length === 0) return NO_REVERT;

    const groups = groupKeysByPrefix(keys);

    // The rows themselves, read before the removal, so the revert puts back
    // exactly what this call took out and nothing else.
    const removed: { prefix: string; file: FileItem }[] = [];
    const { cache } = get();

    for (const [prefix, group] of groups) {
      for (const file of cache[prefix]?.files ?? []) {
        if (group.has(fileKey(file))) removed.push({ prefix, file });
      }
    }

    for (const [prefix, group] of groups) {
      applyToPrefix(
        set,
        get,
        prefix,
        (data) => withoutKeys(data, group),
        (data) => recentWithoutKeys(data, group)
      );
    }

    // Nothing was showing, so nothing needs putting back. The listing will
    // arrive already correct whenever it is read.
    if (removed.length === 0) return NO_REVERT;

    return () => {
      for (const { prefix, file } of removed) {
        applyToPrefix(
          set,
          get,
          prefix,
          (data) => withFile(data, file, true),
          (data) => recentWithFile(data, file)
        );
      }
    };
  },

  addFile: (prefix, file) => {
    const key = toCacheKey(prefix);

    // The same shape a listing would have given us, built from what the upload
    // already knows. An absent timestamp means now: this object was written a
    // moment ago, which is exactly where the recent list should show it.
    const item = enrichFile({
      Key: file.key,
      Size: file.size,
      LastModified: file.lastModified ?? new Date(),
    });

    // Was the row already there before this call? An upload that replaced an
    // existing object finds it listed and withFile leaves it alone - so this
    // call added nothing, and handing back an undo that removes it would take
    // out a row this call is not responsible for.
    const alreadyListed = (get().cache[key]?.files ?? []).some(
      (existing) => fileKey(existing) === file.key
    );

    applyToPrefix(
      set,
      get,
      key,
      (data) => withFile(data, item),
      (data) => recentWithFile(data, item)
    );

    if (alreadyListed) return NO_REVERT;

    return () => {
      const gone = new Set([file.key]);

      applyToPrefix(
        set,
        get,
        key,
        (data) => withoutKeys(data, gone),
        (data) => recentWithoutKeys(data, gone)
      );
    };
  },

  addFolder: (prefix, name) => {
    const parentKey = toCacheKey(prefix);
    const folderPrefix = `${prefix === '/' ? '' : prefix}${name}/`;
    const folder = enrichFolder({ Prefix: folderPrefix });

    // As in addFile: creating a folder over one that is already listed - the
    // "replace" answer to the duplicate prompt - adds nothing, so there is
    // nothing for an undo to take away. Removing the row anyway would delete a
    // folder from the listing that is still perfectly real.
    const alreadyListed = (get().cache[parentKey]?.folders ?? []).some(
      (existing) => folderKey(existing) === folderPrefix
    );

    applyToPrefix(
      set,
      get,
      parentKey,
      (data) => withFolder(data, folder),
      (data) => recentWithFolder(data, folder)
    );

    if (alreadyListed) return NO_REVERT;

    return () => {
      applyToPrefix(
        set,
        get,
        parentKey,
        (data) => withoutFolder(data, folderPrefix),
        (data) => recentWithoutFolder(data, folderPrefix)
      );
    };
  },

  renameFile: (oldKey, newKey) => {
    const prefix = toCacheKey(getParentPrefix(oldKey));
    const existing = get().cache[prefix]?.files.find((file) => fileKey(file) === oldKey);

    // Nothing cached to rename; the listing will arrive already correct.
    if (!existing) return NO_REVERT;

    // Size, timestamp and ETag survive a rename. The key is what changes, and
    // the name, extension and id are read back off it by enrichFile.
    //
    // The two put back afterwards are the ones enrichFile infers from the raw
    // S3 fields rather than from the row: a FileItem is only guaranteed to
    // carry the enriched `size` and `lastModified`, so a row built anywhere but
    // a listing comes back from enrichFile with no date at all - and a file
    // with no date sorts to the bottom of the recent list instead of staying
    // where the user just renamed it.
    const renamed: FileItem = {
      ...enrichFile({ ...existing, Key: newKey }),
      size: existing.size,
      lastModified: existing.lastModified,
    };

    // Is something already sitting at the new key? Answering "replace" to the
    // duplicate prompt renames onto a row that is already listed, so withFile
    // leaves it alone and this call adds nothing - it only takes the old row
    // out. Undoing by removing the new key would then delete a file this call
    // never touched and which is still perfectly real.
    const targetOccupied = (get().cache[prefix]?.files ?? []).some(
      (file) => fileKey(file) === newKey
    );

    // Out and back in rather than in place: the new name sorts somewhere else,
    // and a row left at the old index is a listing out of order.
    const swap = (from: FileItem, to: FileItem) => {
      const fromKey = fileKey(from);
      const gone = new Set([fromKey]);

      applyToPrefix(
        set,
        get,
        prefix,
        (data) => replacingFile(data, fromKey, to),
        (data) => recentWithFile(recentWithoutKeys(data, gone), to)
      );
    };

    swap(existing, renamed);

    if (targetOccupied) {
      // Put back only the row this call removed. Whoever was at the new key
      // was there first and stays.
      return () => {
        applyToPrefix(
          set,
          get,
          prefix,
          (data) => withFile(data, existing, true),
          (data) => recentWithFile(data, existing)
        );
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
    const existing = get().cache[parentKey]?.folders.find(
      (folder) => folderKey(folder) === normalized
    );

    // Every listing cached under the old prefix describes objects that have
    // moved, so they go along with the row in the parent. What is dropped here
    // is re-read on the next visit; the undo below only restores the row, which
    // is the part anyone is looking at.
    get().removeDeletedFolder(normalized);
    const undoAdd = get().addFolder(parent, newName);

    return () => {
      undoAdd();

      if (existing) {
        applyToPrefix(
          set,
          get,
          parentKey,
          (data) => withFolder(data, existing, true),
          (data) => recentWithFolder(data, existing)
        );
      }
    };
  },

  fetchData: async (opts = { sync: false }) => {
    const { apiS3, currentPrefix, rootPrefix, directory, cache, setPrefixData, setDirectoryState } =
      get();

    if (!apiS3) return;

    // Ensure prefixes are available first
    if (currentPrefix === null || rootPrefix === null) return;

    // Normalize the key used for both cache and status
    // When both are '/', we use an empty prefix for the API, but '/' as the key in our store
    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    // Avoid duplicate concurrent fetches unless forced by sync
    const currStatus = directory[keyPrefix]?.status;

    // A silent read is a forced one. Its whole purpose is to replace what is
    // cached, so the checks that skip a fetch when data is present must let it
    // through the same way a sync does.
    const force = opts.sync === true || opts.silent === true;

    if (currStatus === 'ready' && !force) return;

    const currentData = cache[keyPrefix];

    // Data already present and nobody asked for fresh; just reflect it.
    // Don't auto-refetch just because isTruncated is true - let the user decide
    // with the "Show More" button.
    if (currentData && !force) {
      if (currStatus !== 'ready') setDirectoryState(keyPrefix, 'ready');
      return;
    }

    // Join a request already open for this key rather than issuing a second
    // identical one. Navigating A -> B -> A did exactly that: A's first request
    // is still 'loading' rather than 'ready', so the status check above let it
    // through, and cache[A] was still empty, so the data check did too.
    return runDeduped(inFlightFetches, keyPrefix, !force, async () => {
      const requestId = claimRequestId(latestRequestId, keyPrefix);

      try {
        // A silent read leaves the status alone. 'loading' only means anything
        // with nothing to show, and this one runs over a listing already up.
        if (!opts.silent) setDirectoryState(keyPrefix, 'loading');

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
        setDirectoryState(keyPrefix, 'ready');
      } catch (error) {
        // A superseded request must not report an error over a newer request's
        // result, or a folder that loaded fine renders as failed.
        if (isSuperseded(latestRequestId, keyPrefix, requestId)) return;

        // Neither may a silent read. toAsyncState checks 'error' before it
        // checks for data, so writing it here would replace a listing the user
        // is reading with a full-page failure notice - over rows that are still
        // perfectly good. A background read that failed changes nothing.
        if (opts.silent && get().cache[keyPrefix]) return;

        // One write, so there is no frame in which the row knows it failed
        // but not why.
        setDirectoryState(keyPrefix, 'error', classifyConnectionFailure(error));
      }
    });
  },

  refreshCurrentData: async (opts) => {
    const { fetchData, fetchRecentItems, currentPrefix, rootPrefix } = get();

    // Only refresh if we have valid prefixes set
    if (currentPrefix !== null && rootPrefix !== null) {
      // Invalidate search cache for current prefix since data is being refreshed
      useSearchStore.getState().invalidatePrefix(currentPrefix);

      // Refresh both regular cache and recent cache in parallel
      await Promise.all([
        fetchData({ sync: true, silent: opts?.silent }),
        fetchRecentItems({ sync: true, silent: opts?.silent, itemsPerType: 10 }),
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
    const { apiS3, currentPrefix, rootPrefix, recent, recentCache, setRecentData, setRecentState } =
      get();

    if (!apiS3) return;

    if (currentPrefix === null || rootPrefix === null) return;

    const formattedPrefix = rootPrefix === '/' && currentPrefix === '/' ? '' : currentPrefix;
    const keyPrefix = formattedPrefix === '' ? '/' : formattedPrefix;

    const currStatus = recent[keyPrefix]?.status;

    // Same rule as fetchData: silent still means read, it just means read
    // quietly.
    const force = opts.sync === true || opts.silent === true;

    if (currStatus === 'ready' && !force) return;

    // Ensure itemsPerType has a default value
    const itemsPerType = opts.itemsPerType ?? 10;

    // Same A -> B -> A race as fetchData: 'loading' is not 'ready', so
    // returning to a folder whose recent-items request is still open used to
    // fire a second identical one.
    return runDeduped(inFlightRecentFetches, keyPrefix, !force, async () => {
      const requestId = claimRequestId(latestRecentRequestId, keyPrefix);

      try {
        if (!opts.silent) setRecentState(keyPrefix, 'loading');

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

        // `force`, not `opts.sync`: a silent read replaces the listing, so it
        // has to replace the pagination source behind it too. Leaving the old
        // _allFiles in place would let "View more" hand back rows this read
        // just established are gone.
        if (!existingCache || force) {
          // Store full sorted arrays for pagination access
          recentData._allFiles = sortedFiles;
          recentData._allFolders = sortedFolders;
        }

        setRecentData(keyPrefix, recentData);
        setRecentState(keyPrefix, 'ready');
      } catch (error) {
        if (isSuperseded(latestRecentRequestId, keyPrefix, requestId)) return;

        // As in fetchData: a failed background read must not replace a good
        // list with an error notice.
        if (opts.silent && get().recentCache[keyPrefix]) return;

        setRecentState(keyPrefix, 'error', classifyConnectionFailure(error));
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
 * The store keeps the request's state and its data in two maps, which is fine
 * for writing but is exactly what let both dashboard pages ask whether a
 * listing was ready and render a skeleton for every other answer - so a failed
 * listing sat behind a skeleton forever. Narrowing happens here once, so a page
 * reaches `data` only through the branch that has any.
 */
export function useDirectoryState(): AsyncState<PrefixData> {
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const entry = useDriveStore((state) =>
    currentPrefix ? state.directory[currentPrefix] : undefined
  );
  const data = useDriveStore((state) => (currentPrefix ? state.cache[currentPrefix] : undefined));
  const fetchData = useDriveStore((state) => state.fetchData);

  return toAsyncState(entry, data, () => void fetchData({ sync: true }));
}

/** The same, for the recent-items list on the dashboard home. */
export function useRecentState(): AsyncState<RecentDataWithCache> {
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const entry = useDriveStore((state) => (currentPrefix ? state.recent[currentPrefix] : undefined));
  const data = useDriveStore((state) =>
    currentPrefix ? state.recentCache[currentPrefix] : undefined
  );
  const fetchRecentItems = useDriveStore((state) => state.fetchRecentItems);

  return toAsyncState(entry, data, () => void fetchRecentItems({ sync: true }));
}

function toAsyncState<T>(
  entry: RequestState | undefined,
  data: T | undefined,
  retry: () => void
): AsyncState<T> {
  if (entry?.status === 'error') {
    // The reason arrives with the status now, so the fallback is only for a
    // failure recorded before this rule existed.
    return {
      state: 'error',
      failure: entry.failure ?? classifyConnectionFailure(undefined),
      retry,
    };
  }

  // Data without a ready status is a folder being re-synced: it has rows on
  // screen already, and blanking them back to a skeleton mid-refresh would be
  // a worse answer than showing what is there.
  if (data !== undefined) return { state: 'ready', data };

  return entry?.status === 'loading' ? { state: 'loading' } : { state: 'idle' };
}
