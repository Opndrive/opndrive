/**
 * One folder's listing, as far as the user has scrolled into it, and the pure
 * functions that change it. The drive store holds one of these per folder.
 *
 * Everything here keeps S3's order. S3 returns a folder's entries sorted by key
 * and nothing else - no sort by date, size or type, and no total count until
 * the last page - so this is the only order there is. Folders and files are
 * held apart (folders are shown first) but each list is in key order, and a
 * page always continues where the previous one stopped.
 *
 * Kept in memory only. File names are private, so none of this is ever written
 * to localStorage or IndexedDB.
 */

import type { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import type { DataUnits, FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ConnectionFailure } from '@/lib/s3/connection-failure';

export type Status = 'idle' | 'loading' | 'ready' | 'error';

/** The page after the ones loaded: being read, failed, or neither. */
export interface PageState {
  status: 'idle' | 'loading' | 'error';
  /** Only with status 'error'. */
  failure?: ConnectionFailure;
}

export interface FolderListing {
  /** Folders in S3's order, as far as pages have been read. */
  folders: Folder[];
  /** Files in S3's order, as far as pages have been read. */
  files: FileItem[];
  /** S3's continuation token for the next page. Absent once complete. */
  cursor?: string;
  /** The last page has arrived: the rows are the whole folder. */
  complete: boolean;
  /** Whether any page has ever arrived. Until then there are no rows to show. */
  loaded: boolean;
  /**
   * The first page. 'ready' once rows exist; a quiet refresh leaves it there.
   * 'error' with rows means a refresh the user asked for failed.
   */
  status: Status;
  /** Only with status 'error'. */
  failure?: ConnectionFailure;
  /** The page after the loaded ones. Its failure never touches the rows. */
  nextPage: PageState;
  /** Where the list was scrolled to, so coming back lands in the same place. */
  scrollOffset: number;
  /** When it was last shown or read, for evicting the least recently used. */
  lastUsed: number;
}

/** What one ListObjectsV2 page brings, already turned into rows. */
export interface ListingPage {
  folders: Folder[];
  files: FileItem[];
  cursor?: string;
  complete: boolean;
}

export function emptyListing(now: number): FolderListing {
  return {
    folders: [],
    files: [],
    complete: false,
    loaded: false,
    status: 'idle',
    nextPage: { status: 'idle' },
    scrollOffset: 0,
    lastUsed: now,
  };
}

/**
 * A listing with rows, for tests and for anything that builds one by hand.
 * `complete` defaults to true: a hand-built listing is usually the whole folder.
 */
export function listingOf(
  rows: { folders?: Folder[]; files?: FileItem[]; cursor?: string; complete?: boolean },
  now = 0
): FolderListing {
  const complete = rows.complete ?? rows.cursor === undefined;
  return {
    ...emptyListing(now),
    folders: rows.folders ?? [],
    files: rows.files ?? [],
    cursor: complete ? undefined : rows.cursor,
    complete,
    loaded: true,
    status: 'ready',
  };
}

/**
 * S3's order: by key, compared as UTF-8 bytes. UTF-8 sorts the same way as
 * Unicode code points, which JavaScript's `<` does not quite do - it compares
 * UTF-16 units, and puts an emoji (a surrogate pair) before characters such as
 * U+FF71 that S3 puts before it. Comparing code points matches S3 exactly.
 */
export function compareKeys(a: string, b: string): number {
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }

  return a.length - i === b.length - j ? 0 : a.length - i < b.length - j ? -1 : 1;
}

export function fileKey(file: FileItem): string {
  return file.Key ?? file.id;
}

export function folderKey(folder: Folder): string {
  return folder.Prefix ?? folder.id;
}

/** How many entries are loaded: folders and files. */
export function entryCount(listing: FolderListing): number {
  return listing.folders.length + listing.files.length;
}

/**
 * The last key S3 has handed us, or undefined when nothing is loaded. Folders
 * and files share one stream of pages, so it is the greater of the two ends.
 */
export function loadedEnd(listing: FolderListing): string | undefined {
  const lastFolder = listing.folders[listing.folders.length - 1];
  const lastFile = listing.files[listing.files.length - 1];
  const a = lastFolder ? folderKey(lastFolder) : undefined;
  const b = lastFile ? fileKey(lastFile) : undefined;

  if (a === undefined) return b;
  if (b === undefined) return a;
  return compareKeys(a, b) >= 0 ? a : b;
}

/**
 * Whether a key falls inside what has been loaded. Past the end of an
 * incomplete listing, a key belongs to a page not read yet: putting it in now
 * would show it out of place, and when its page arrives the real row would be
 * dropped as a duplicate.
 */
export function withinLoaded(listing: FolderListing, key: string): boolean {
  if (listing.complete) return true;

  const end = loadedEnd(listing);
  return end !== undefined && compareKeys(key, end) <= 0;
}

// ---------------------------------------------------------------------------
// Turning S3's answer into rows
// ---------------------------------------------------------------------------

/**
 * A size as a number and a unit, for the file list: 0 B for nothing (or a
 * nonsense negative), two decimals at most, and TB as the largest unit.
 */
export function formatBytes(bytes: number | undefined): { value: number; unit: DataUnits } {
  if (!bytes || bytes < 0) return { value: 0, unit: 'B' };

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return { value: parseFloat(size.toFixed(2)), unit: units[i] as DataUnits };
}

export function enrichFolder(obj: CommonPrefix): Folder {
  const parts = obj.Prefix?.split('/');
  const name = parts && parts.length >= 2 ? parts[parts.length - 2] : undefined;

  return {
    ...obj,
    id: obj.Prefix || `folder-${Date.now()}-${Math.random()}`,
    kind: 'folder',
    name: name ?? '',
    icon: 'folder',
    location: { type: 'my-drive', label: 'My Drive' },
  };
}

export function enrichFile(obj: _Object): FileItem {
  const parts = obj.Key?.split('/');
  const name = parts && parts.length >= 1 ? parts[parts.length - 1] : undefined;
  const ext = name?.split('.').pop()?.toLowerCase();

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

/**
 * One ListObjectsV2 page as rows. The folder's own marker object (its key is
 * the prefix itself) and an empty CommonPrefix are not entries in it.
 */
export function toPage(
  raw: { folders: CommonPrefix[]; files: _Object[]; nextToken?: string; isTruncated?: boolean },
  prefix: string
): ListingPage {
  return {
    folders: raw.folders.filter((obj) => obj.Prefix !== '').map(enrichFolder),
    files: raw.files.filter((obj) => obj.Key !== prefix).map(enrichFile),
    cursor: raw.isTruncated ? raw.nextToken : undefined,
    complete: !raw.isTruncated || !raw.nextToken,
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function appendUnique<T>(existing: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  if (incoming.length === 0) return existing;

  const seen = new Set(existing.map(keyOf));
  const additions = incoming.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return additions.length > 0 ? [...existing, ...additions] : existing;
}

/**
 * The next page, added after what is loaded. Pages do not overlap, so a key
 * already present means the same page arrived twice, and is dropped rather
 * than listed twice.
 */
export function appendPage(listing: FolderListing, page: ListingPage): FolderListing {
  return {
    ...listing,
    folders: appendUnique(listing.folders, page.folders, folderKey),
    files: appendUnique(listing.files, page.files, fileKey),
    cursor: page.complete ? undefined : page.cursor,
    complete: page.complete,
    loaded: true,
  };
}

/**
 * A fresh first page, laid over a listing that may hold many pages.
 *
 * Replacing the whole listing with page 1 would throw away every row the user
 * scrolled to, so the fresh page replaces only the range it covers - every key
 * up to its last - and the rows loaded past that stay. The cursor that goes
 * with the result is whichever reaches further: the old one, when rows beyond
 * the fresh page are kept, or the fresh page's own.
 */
export function mergeFirstPage(listing: FolderListing, page: ListingPage): FolderListing {
  const fresh = { ...listing, loaded: true };

  if (!listing.loaded || page.complete) {
    return {
      ...fresh,
      folders: page.folders,
      files: page.files,
      cursor: page.complete ? undefined : page.cursor,
      complete: page.complete,
    };
  }

  const pageEnd = loadedEnd({ ...listing, folders: page.folders, files: page.files });
  const oldEnd = loadedEnd(listing);

  // An empty page that says there is more is not something S3 sends; treat it
  // as the start and keep the rest.
  if (pageEnd === undefined) return fresh;

  const beyond = (key: string) => compareKeys(key, pageEnd) > 0;
  const keptFolders = listing.folders.filter((folder) => beyond(folderKey(folder)));
  const keptFiles = listing.files.filter((file) => beyond(fileKey(file)));
  const oldReachesFurther =
    listing.complete || (oldEnd !== undefined && compareKeys(oldEnd, pageEnd) > 0);

  return {
    ...fresh,
    folders: appendUnique(page.folders, keptFolders, folderKey),
    files: appendUnique(page.files, keptFiles, fileKey),
    cursor: oldReachesFurther ? listing.cursor : page.cursor,
    complete: oldReachesFurther ? listing.complete : false,
  };
}

// ---------------------------------------------------------------------------
// Local changes: uploads, deletes, renames, new folders
// ---------------------------------------------------------------------------

function insertionIndex<T>(items: readonly T[], key: string, keyOf: (item: T) => string): number {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (compareKeys(keyOf(items[mid]!), key) < 0) low = mid + 1;
    else high = mid;
  }

  return low;
}

function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/**
 * The listing with a file added in key order.
 *
 * Only inside the loaded range: see `withinLoaded`. `restoring` lifts that for
 * a row this session took out a moment ago - once it is gone, the key before it
 * is the last loaded one, and the rule would refuse to put back the very row it
 * was asked to restore.
 */
export function withFile(listing: FolderListing, file: FileItem, restoring = false): FolderListing {
  const key = fileKey(file);

  // Already listed: an upload that overwrote an object, or an undo running twice.
  if (listing.files.some((existing) => fileKey(existing) === key)) return listing;
  if (!restoring && !withinLoaded(listing, key)) return listing;

  return {
    ...listing,
    files: insertAt(listing.files, file, insertionIndex(listing.files, key, fileKey)),
  };
}

/** `restoring` as in withFile. */
export function withFolder(
  listing: FolderListing,
  folder: Folder,
  restoring = false
): FolderListing {
  const key = folderKey(folder);

  if (listing.folders.some((existing) => folderKey(existing) === key)) return listing;
  if (!restoring && !withinLoaded(listing, key)) return listing;

  return {
    ...listing,
    folders: insertAt(listing.folders, folder, insertionIndex(listing.folders, key, folderKey)),
  };
}

/**
 * The listing without the named files, matched by whole key - never by prefix,
 * which would take "report.pdf.bak" along with "report.pdf". Returns the same
 * object when nothing matched, so a change in one folder does not re-render
 * the others.
 */
export function withoutKeys(listing: FolderListing, keys: ReadonlySet<string>): FolderListing {
  const files = listing.files.filter((file) => !keys.has(fileKey(file)));
  return files.length === listing.files.length ? listing : { ...listing, files };
}

/** One folder row taken out, matched by whole prefix. */
export function withoutFolder(listing: FolderListing, prefix: string): FolderListing {
  const folders = listing.folders.filter((folder) => folderKey(folder) !== prefix);
  return folders.length === listing.folders.length ? listing : { ...listing, folders };
}

/** Everything at or under `prefix` taken out: the parent of a deleted folder. */
export function withoutPrefix(listing: FolderListing, prefix: string): FolderListing {
  const under = (key: string | undefined) => typeof key === 'string' && key.startsWith(prefix);
  const folders = listing.folders.filter((folder) => !under(folder.Prefix));
  const files = listing.files.filter((file) => !under(file.Key));

  return folders.length === listing.folders.length && files.length === listing.files.length
    ? listing
    : { ...listing, folders, files };
}

/**
 * A row swapped for another under a new name. The loaded-range rule is lifted:
 * this is a row the listing was already showing, and the rule cannot tell that
 * from an object of an unread page - renaming the last loaded row would read as
 * deleting it.
 */
export function replacingFile(
  listing: FolderListing,
  fromKey: string,
  to: FileItem
): FolderListing {
  return withFile(withoutKeys(listing, new Set([fromKey])), to, true);
}

// ---------------------------------------------------------------------------
// The recent-folders cap
// ---------------------------------------------------------------------------

export const MAX_LISTINGS = 20;
export const MAX_ENTRIES = 200_000;

/**
 * The keys to forget so the cache fits: least recently used first, never the
 * folder on screen. Within about 20 folders and about 200,000 entries, so
 * browsing a bucket for an hour does not hold every folder it ever opened.
 */
export function keysToEvict(
  listings: Readonly<Record<string, FolderListing>>,
  keep: string | null,
  limits = { listings: MAX_LISTINGS, entries: MAX_ENTRIES }
): string[] {
  const keys = Object.keys(listings);
  let count = keys.length;
  let entries = keys.reduce((sum, key) => sum + entryCount(listings[key]!), 0);

  if (count <= limits.listings && entries <= limits.entries) return [];

  const oldestFirst = keys
    .filter((key) => key !== keep)
    .sort((a, b) => listings[a]!.lastUsed - listings[b]!.lastUsed);

  const evicted: string[] = [];
  for (const key of oldestFirst) {
    if (count <= limits.listings && entries <= limits.entries) break;
    evicted.push(key);
    count -= 1;
    entries -= entryCount(listings[key]!);
  }

  return evicted;
}

/** Files newest first, for the home page's suggestions. A view, not a copy kept anywhere. */
export function newestFirst(files: readonly FileItem[]): FileItem[] {
  const time = (file: FileItem) => (file.lastModified ? file.lastModified.getTime() : 0);
  return [...files].sort((a, b) => time(b) - time(a));
}
