/**
 * The one answer to "is this a file or a folder?", and the one answer to
 * "which item is this?".
 *
 * The types used to carry nothing saying what they were. `Folder extends
 * CommonPrefix` and `FileItem extends _Object`, and in both the identifying
 * field - `Prefix`, `Key` - is optional. So every site that needed to tell them
 * apart invented its own test, and they were not invented the same way: four
 * different predicates across twenty sites, disagreeing at exactly the edges
 * that matter. One of the places they disagreed was delete, where a folder
 * marker was sent to the file path and took only itself with it.
 *
 * Both types now carry a `kind` tag, set by whichever factory built them, and
 * these read it first. It is optional, so anything built before it existed or
 * restored from a cache written before it still has to be handled - which is
 * why every structural test below is still here, as the fallback.
 *
 * One thing the tag deliberately does not settle. It records the SHAPE an item
 * was built as, and a zero-byte object whose key ends in a slash is built by
 * the file factory like everything else in a listing - so it carries
 * `kind: 'file'` while being a folder to anyone looking at it. `isFolderMarker`
 * is checked before the tag everywhere it matters, and that ordering is what
 * keeps such an object off the file delete path.
 *
 * This module is the single place that decides. Everything else asks it.
 */

import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

/** What an item turned out to be, including the case where we cannot tell. */
export type DriveItemKind = 'folder' | 'file' | 'unknown';

type MaybeFolder = { Prefix?: unknown };
type MaybeFile = { Key?: unknown };
type MaybeTagged = { kind?: unknown };

/**
 * The tag a factory stamped on, if there is one and it is one we know.
 *
 * Absent means the item predates the tag or came out of a cache written before
 * it, so the structural tests below still have to answer. Anything else in the
 * field is treated as absent rather than trusted.
 */
function readKind(item: unknown): 'folder' | 'file' | null {
  if (typeof item !== 'object' || item === null) return null;
  const kind = (item as MaybeTagged).kind;
  return kind === 'folder' || kind === 'file' ? kind : null;
}

function readPrefix(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) return null;
  const prefix = (item as MaybeFolder).Prefix;
  return typeof prefix === 'string' && prefix.length > 0 ? prefix : null;
}

function readKey(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) return null;
  const key = (item as MaybeFile).Key;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

/**
 * A folder proper - one listed as a CommonPrefix, carrying a `Prefix`.
 *
 * Narrow on purpose. A folder marker is shaped like a file and claiming
 * otherwise would be a lie the compiler then trusts, so it gets its own test
 * below rather than being folded in here.
 */
export function isFolder(item: unknown): item is Folder {
  const kind = readKind(item);
  if (kind !== null) return kind === 'folder';

  // Untagged, so fall back to the shape. This is the branch that could not
  // answer for a folder arriving without a `Prefix` - the tag exists to stop
  // that being unanswerable.
  return readPrefix(item) !== null;
}

/**
 * An object stored under a key that ends in a slash: a folder represented as an
 * object rather than as a prefix.
 *
 * S3 has no directories. A folder is either inferred from a delimiter - which
 * is what gives a `Prefix` - or written explicitly as a zero-byte object whose
 * key ends in `/`. Both are folders to the person looking at them, and deleting
 * one has to take its contents with it. Reading the trailing slash is the only
 * way to tell the second kind from an ordinary file.
 */
export function isFolderMarker(item: unknown): item is FileItem {
  if (isFolder(item)) return false;

  // Deliberately not tag-aware beyond that. The same factory builds every
  // object in a listing, marker or not, so a marker carries `kind: 'file'` like
  // everything else. Consulting the tag here would hand it back to the file
  // path, which is what deleted the marker and orphaned everything under it.
  const key = readKey(item);
  return key !== null && key.endsWith('/');
}

/** Either kind of folder. The test most callers actually want. */
export function isFolderLike(item: unknown): boolean {
  return isFolder(item) || isFolderMarker(item);
}

/**
 * A real file - something with contents a person can open, download or share.
 *
 * Excludes folder markers, which is what separates this from a bare `'Key' in
 * item` check. Every action gated on this is one that makes no sense for a
 * folder.
 */
export function isFile(item: unknown): item is FileItem {
  // Checked before the tag, for the reason given on isFolderMarker.
  if (isFolderMarker(item)) return false;

  const kind = readKind(item);
  if (kind !== null) return kind === 'file' && readKey(item) !== null;

  return readKey(item) !== null;
}

/** What this item is, for callers that need to branch on all three cases. */
export function driveItemKind(item: unknown): DriveItemKind {
  if (isFolderLike(item)) return 'folder';
  if (isFile(item)) return 'file';
  return 'unknown';
}

/**
 * A folder marker as a `Folder`, so the folder delete path can take it.
 *
 * That path reads `Prefix || name` and normalises a trailing slash onto it, so
 * handing it the marker's own key deletes the prefix and everything beneath it
 * rather than just the marker object.
 */
export function folderFromMarker(marker: FileItem): Folder {
  const key = readKey(marker) ?? marker.name;

  return {
    ...marker,
    // After the spread, which carries the marker's own `kind: 'file'` across.
    // Leaving that in place would make isFolder reject the very thing this
    // function exists to produce, and the folder delete path would refuse it.
    kind: 'folder',
    Prefix: key,
    name: marker.name,
    icon: 'folder',
    location: { type: 'my-drive', label: 'My Drive' },
  } as Folder;
}

/**
 * Identity, guaranteed non-empty and never shared between two different items.
 *
 * `id` comes first because it is the only field that is always populated:
 * `enrichFolder` and `enrichFile` both fall back to a generated one precisely
 * because the S3 field can be absent. The previous version of this went
 * `Key`, then `Prefix`, then the empty string - so any two items missing both
 * collapsed into one item, and selecting either showed both as selected.
 */
export function itemKey(item: unknown): string {
  if (typeof item !== 'object' || item === null) return syntheticKey(item);

  const id = (item as { id?: unknown }).id;
  if (typeof id === 'string' && id.length > 0) return id;

  const key = readKey(item);
  if (key !== null) return key;

  const prefix = readPrefix(item);
  if (prefix !== null) return prefix;

  return syntheticKey(item);
}

/**
 * A last resort for an item carrying no usable identifier at all.
 *
 * Keyed off the object itself, so the same item answers the same way every
 * time it is asked - which selection depends on - while two distinct items
 * still never collide. A counter rather than a random value keeps it readable
 * when one shows up in a log.
 */
const syntheticKeys = new WeakMap<object, string>();
let syntheticCount = 0;

function syntheticKey(item: unknown): string {
  if (typeof item !== 'object' || item === null) {
    return `drive-item:unidentifiable:${++syntheticCount}`;
  }

  const existing = syntheticKeys.get(item);
  if (existing !== undefined) return existing;

  const created = `drive-item:unidentifiable:${++syntheticCount}`;
  syntheticKeys.set(item, created);
  return created;
}
