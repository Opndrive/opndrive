/**
 * The one place that decides whether an item is a file or a folder.
 *
 * Four different predicates used to answer this across twenty sites, and they
 * disagreed at the edges. One of the places they disagreed was delete, where a
 * folder marker was handed to the file path and took only itself with it.
 *
 * Two rules run through everything below.
 *
 * The first is that the `kind` tag a factory stamps on is read before the
 * shape, but the tag is optional - anything built before it existed, or
 * restored from a cache written before it, still has to be answered for. So
 * every case is stated twice where it matters: once tagged, once not.
 *
 * The second is that the tag records the SHAPE an item was built as, not what
 * it means. A zero-byte object whose key ends in a slash is built by the file
 * factory like everything else in a listing, so it carries `kind: 'file'` while
 * being a folder to anyone looking at it. That is the case most of this file
 * exists to hold down.
 */

import { describe, it, expect } from 'vitest';
import {
  driveItemKind,
  folderFromMarker,
  isFile,
  isFolder,
  isFolderLike,
  isFolderMarker,
  itemKey,
} from './drive-item';
import type { FileItem } from '@/features/dashboard/types/file';

/** Untagged, the way anything built before the tag existed still looks. */
const untaggedFile = { Key: 'reports/budget.xlsx', name: 'budget.xlsx' };
const untaggedFolder = { Prefix: 'reports/', name: 'Reports' };
const untaggedMarker = { Key: 'archive/photos/', name: 'Photos' };

/** Tagged, the way every factory builds them now. */
const taggedFile = { kind: 'file', Key: 'reports/budget.xlsx', name: 'budget.xlsx' };
const taggedFolder = { kind: 'folder', Prefix: 'reports/', name: 'Reports' };

/**
 * The trap. Built by the file factory, so tagged `file` - and a folder.
 *
 * Trusting the tag here is what sent it to deleteFile, which removed the marker
 * object and left everything stored beneath it orphaned: still billed, and no
 * longer reachable by a listing with no prefix to find it under.
 */
const taggedMarker = { kind: 'file', Key: 'archive/photos/', name: 'Photos' };

describe('reading the tag', () => {
  it('calls a tagged folder a folder', () => {
    expect(isFolder(taggedFolder)).toBe(true);
    expect(isFile(taggedFolder)).toBe(false);
    expect(driveItemKind(taggedFolder)).toBe('folder');
  });

  it('calls a tagged file a file', () => {
    expect(isFile(taggedFile)).toBe(true);
    expect(isFolder(taggedFile)).toBe(false);
    expect(driveItemKind(taggedFile)).toBe('file');
  });

  it('believes the tag over the shape', () => {
    // Contrived, but it pins the precedence: nothing structural gets to
    // overrule a factory that already said what it built.
    const oddity = { kind: 'folder', Key: 'reports/budget.xlsx', name: 'Reports' };

    expect(isFolder(oddity)).toBe(true);
    expect(isFile(oddity)).toBe(false);
  });

  it('answers for a folder that arrived without a prefix', () => {
    // The case that had no answer at all before the tag. `Prefix` is optional
    // on CommonPrefix, so a folder without one left nothing to test and fell
    // through to being treated as a file.
    const noPrefix = { kind: 'folder', name: 'Reports' };

    expect(isFolder(noPrefix)).toBe(true);
    expect(driveItemKind(noPrefix)).toBe('folder');
  });

  it('ignores a tag it does not recognise', () => {
    // A cache written by a future version, or a hand-built object. Anything
    // that is not one of the two literals is treated as absent rather than
    // trusted, so the structural fallback still answers.
    const bogus = { kind: 'directory', Key: 'reports/budget.xlsx', name: 'budget.xlsx' };

    expect(isFile(bogus)).toBe(true);
    expect(isFolder(bogus)).toBe(false);
  });

  it('falls back to the shape when the tag is absent', () => {
    expect(isFile(untaggedFile)).toBe(true);
    expect(isFolder(untaggedFolder)).toBe(true);
    expect(driveItemKind(untaggedFile)).toBe('file');
    expect(driveItemKind(untaggedFolder)).toBe('folder');
  });
});

describe('a folder stored as an object', () => {
  it('is a folder even though the tag says file', () => {
    expect(isFolderMarker(taggedMarker)).toBe(true);
    expect(isFolderLike(taggedMarker)).toBe(true);
    expect(driveItemKind(taggedMarker)).toBe('folder');
  });

  it('is never a file, whatever the tag says', () => {
    // The single assertion this module exists for. Everything gated on isFile
    // - open, download, share, and the file branch of delete - is something
    // that makes no sense for a folder.
    expect(isFile(taggedMarker)).toBe(false);
    expect(isFile(untaggedMarker)).toBe(false);
  });

  it('is recognised without a tag too', () => {
    expect(isFolderMarker(untaggedMarker)).toBe(true);
    expect(driveItemKind(untaggedMarker)).toBe('folder');
  });

  it('is not a prefix folder, which is a different shape', () => {
    // isFolder stays narrow so that `item is Folder` is not a lie: a marker
    // carries a Key, not a Prefix, and Folder.location is a different shape
    // from FileItem.location.
    expect(isFolder(taggedMarker)).toBe(false);
    expect(isFolder(untaggedMarker)).toBe(false);
  });

  it('does not catch a file that merely lives under a folder', () => {
    // Only a trailing slash makes a marker. A key with slashes in the middle
    // is an ordinary file in a subdirectory.
    expect(isFolderMarker({ kind: 'file', Key: 'a/b/c.txt', name: 'c.txt' })).toBe(false);
    expect(isFile({ kind: 'file', Key: 'a/b/c.txt', name: 'c.txt' })).toBe(true);
  });
});

describe('the three answers never overlap', () => {
  it.each([
    ['untagged file', untaggedFile],
    ['untagged prefix folder', untaggedFolder],
    ['untagged marker', untaggedMarker],
    ['tagged file', taggedFile],
    ['tagged prefix folder', taggedFolder],
    ['tagged marker', taggedMarker],
    ['tagged folder with no prefix', { kind: 'folder', name: 'Reports' }],
    ['an item with nothing to go on', { name: 'orphan' }],
  ])('%s matches at most one guard', (_label, item) => {
    const matches = [isFolder(item), isFolderMarker(item), isFile(item)].filter(Boolean).length;

    // Two guards agreeing is how the old predicates produced different answers
    // in different files for the same item.
    expect(matches).toBeLessThanOrEqual(1);
  });
});

describe('items with nothing to go on', () => {
  it('is neither a file nor a folder', () => {
    const orphan = { name: 'orphan' };

    expect(isFolder(orphan)).toBe(false);
    expect(isFile(orphan)).toBe(false);
    expect(isFolderMarker(orphan)).toBe(false);
    expect(driveItemKind(orphan)).toBe('unknown');
  });

  it('reports unknown rather than guessing, even when tagged', () => {
    // A tag with no key behind it is not enough to act on: every file action
    // needs the key. Better to say so than to pick a branch.
    expect(driveItemKind({ kind: 'file', name: 'no key' })).toBe('unknown');
  });

  it('survives values that are not items at all', () => {
    for (const value of [null, undefined, 42, 'reports/', []]) {
      expect(isFolder(value)).toBe(false);
      expect(isFile(value)).toBe(false);
      expect(isFolderMarker(value)).toBe(false);
    }
  });

  it('treats an empty key or prefix as absent', () => {
    expect(isFile({ kind: 'file', Key: '', name: 'x' })).toBe(false);
    expect(isFolder({ Prefix: '', name: 'x' })).toBe(false);
  });
});

describe('turning a marker into a folder', () => {
  const marker = {
    id: 'archive/photos/',
    kind: 'file',
    Key: 'archive/photos/',
    name: 'Photos',
  } as unknown as FileItem;

  it('produces something isFolder accepts', () => {
    // Without this the folder delete path refuses the very thing the function
    // exists to hand it, because the spread carries the marker's own
    // `kind: 'file'` across.
    expect(isFolder(folderFromMarker(marker))).toBe(true);
  });

  it('overrides the tag it inherited', () => {
    expect(folderFromMarker(marker).kind).toBe('folder');
  });

  it('carries the key across as the prefix', () => {
    // deleteFolderWithProgress reads `Prefix || name` and normalises a trailing
    // slash onto it, so this is what makes the delete cover the contents.
    expect(folderFromMarker(marker).Prefix).toBe('archive/photos/');
  });

  it('keeps the name and the identity', () => {
    const folder = folderFromMarker(marker);

    expect(folder.name).toBe('Photos');
    expect(itemKey(folder)).toBe(itemKey(marker));
  });

  it('falls back to the name when there is no key', () => {
    const nameless = { name: 'Photos' } as FileItem;

    expect(folderFromMarker(nameless).Prefix).toBe('Photos');
  });
});

describe('identity', () => {
  it('reads the id first, the one field always populated', () => {
    // enrichFolder and enrichFile both generate an id when the S3 field is
    // absent, which is what makes it the only safe first choice.
    expect(itemKey({ id: 'generated-1', Key: 'a.txt' })).toBe('generated-1');
    expect(itemKey({ id: 'generated-2', Prefix: 'docs/' })).toBe('generated-2');
  });

  it('falls back to the key, then the prefix', () => {
    expect(itemKey(untaggedFile)).toBe('reports/budget.xlsx');
    expect(itemKey(untaggedFolder)).toBe('reports/');
  });

  it('never returns an empty string', () => {
    for (const value of [{ name: 'orphan' }, {}, null, undefined, 7]) {
      expect(itemKey(value)).not.toBe('');
    }
  });

  it('gives one item the same answer every time', () => {
    // Selection compares by this, so an item that answered differently between
    // renders would drop out of the selection it was just added to.
    const orphan = { name: 'orphan' };

    expect(itemKey(orphan)).toBe(itemKey(orphan));
  });

  it('keeps two items with no identifier apart', () => {
    // Both used to key to the empty string, so they were one item: selecting
    // either showed both selected, and deselecting one removed both.
    expect(itemKey({ name: 'one' })).not.toBe(itemKey({ name: 'two' }));
  });

  it('ignores an id that is not a usable string', () => {
    expect(itemKey({ id: '', Key: 'a.txt' })).toBe('a.txt');
    expect(itemKey({ id: 42, Key: 'a.txt' })).toBe('a.txt');
  });
});
