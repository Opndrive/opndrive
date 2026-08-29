/**
 * Localized edits to the drive cache.
 *
 * Every file operation used to end in refreshCurrentData, which re-lists the
 * prefix the user is standing in - twice, once for the listing and once for the
 * recent items - whatever prefix the operation actually touched. These mutators
 * replace that with an edit to the rows themselves.
 *
 * What is pinned here is mostly the ways that edit can go wrong: matching a
 * file by prefix instead of by whole key, inserting into a page nobody has
 * fetched, moving a window without moving the offset that marks its edge, and
 * undoing a change by restoring a snapshot that also undoes everyone else's.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDriveStore } from './data-context';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

function folder(prefix: string): Folder {
  const name = prefix.replace(/\/$/, '').split('/').pop() ?? '';
  return {
    Prefix: prefix,
    id: prefix,
    name,
    icon: 'folder',
    location: { type: 'my-drive', label: 'My Drive' },
  };
}

function file(key: string, minutesAgo = 0): FileItem {
  return {
    Key: key,
    id: key,
    name: key.split('/').pop() ?? '',
    extension: 'txt',
    size: { value: 1, unit: 'B' },
    lastModified: new Date(Date.UTC(2026, 0, 1, 12, 0) - minutesAgo * 60_000),
  };
}

const store = () => useDriveStore.getState();
const keysAt = (prefix: string) => store().cache[prefix]?.files.map((item) => item.Key);
const foldersAt = (prefix: string) => store().cache[prefix]?.folders.map((item) => item.Prefix);

beforeEach(() => {
  useDriveStore.setState({
    apiS3: null,
    cache: {},
    recentCache: {},
    directory: {},
    recent: {},
    loadMoreStatus: {},
    rootPrefix: '/',
    currentPrefix: '/',
  });
});

describe('removing files by whole key', () => {
  beforeEach(() => {
    useDriveStore.setState({
      cache: {
        '/': {
          files: [file('report.pdf'), file('report.pdf.bak'), file('notes.txt')],
          folders: [],
          isTruncated: false,
        },
      },
    });
  });

  it('takes out only the file named', () => {
    store().removeFiles(['report.pdf']);

    expect(keysAt('/')).toEqual(['report.pdf.bak', 'notes.txt']);
  });

  it('leaves a listing alone when nothing matches', () => {
    const before = store().cache['/'];
    store().removeFiles(['absent.txt']);

    // Same object, not merely an equal one: a change aimed elsewhere must not
    // re-render the folder on screen.
    expect(store().cache['/']).toBe(before);
  });

  it('routes each key to the listing that holds it', () => {
    useDriveStore.setState({
      cache: {
        '/': { files: [file('a.txt')], folders: [], isTruncated: false },
        'docs/': { files: [file('docs/b.txt')], folders: [], isTruncated: false },
      },
    });

    store().removeFiles(['a.txt', 'docs/b.txt']);

    expect(keysAt('/')).toEqual([]);
    expect(keysAt('docs/')).toEqual([]);
  });
});

describe('inserting into a truncated listing', () => {
  beforeEach(() => {
    useDriveStore.setState({
      cache: {
        'x/': {
          files: [file('x/a.txt'), file('x/m.txt')],
          folders: [],
          isTruncated: true,
          nextToken: 'token',
        },
      },
    });
  });

  it('skips a key belonging to a page nobody has fetched', () => {
    store().addFile('x/', { key: 'x/z.txt', size: 10 });

    // 'z' sorts past the last key read, so the real object is in a page still
    // to come. Placing it here would make appendUnique drop that object when
    // the page arrives, stranding this guess in its place.
    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/m.txt']);
  });

  it('still places a key that falls inside what was fetched', () => {
    store().addFile('x/', { key: 'x/b.txt', size: 10 });

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/b.txt', 'x/m.txt']);
  });

  it('places a key past the end once the listing is complete', () => {
    useDriveStore.setState({
      cache: { 'x/': { files: [file('x/a.txt')], folders: [], isTruncated: false } },
    });

    store().addFile('x/', { key: 'x/z.txt', size: 10 });

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/z.txt']);
  });

  it('leaves the server cursor alone when removing', () => {
    store().removeFiles(['x/a.txt']);

    // nextToken marks where the server stopped reading, not what we are
    // holding, so filtering locally must not disturb it.
    expect(store().cache['x/']?.nextToken).toBe('token');
    expect(store().cache['x/']?.isTruncated).toBe(true);
  });
});

describe('the recent list and its pagination window', () => {
  beforeEach(() => {
    useDriveStore.setState({
      recentCache: {
        '/': {
          files: [file('c.txt', 1), file('b.txt', 2), file('a.txt', 3)],
          folders: [],
          _allFiles: [file('c.txt', 1), file('b.txt', 2), file('a.txt', 3), file('old.txt', 99)],
          _allFolders: [],
          fileOffset: 3,
          folderOffset: 0,
          hasMoreFiles: true,
          hasMoreFolders: false,
        },
      },
    });
  });

  it('adds a new file to the window and the source behind it', () => {
    store().addFile('/', { key: 'fresh.txt', size: 5 });

    const recent = store().recentCache['/']!;

    expect(recent.files[0]?.Key).toBe('fresh.txt');
    expect(recent._allFiles?.[0]?.Key).toBe('fresh.txt');
    expect(recent._allFiles).toHaveLength(5);
    // The window grew, so the mark of how far it reaches grows with it.
    // Left at 3, "View more" would hand back c.txt a second time.
    expect(recent.fileOffset).toBe(4);
    expect(recent.hasMoreFiles).toBe(true);
  });

  it('keeps a file older than the window out of it', () => {
    store().addFile('/', { key: 'ancient.txt', size: 5, lastModified: new Date(0) });

    const recent = store().recentCache['/']!;

    expect(recent.files.map((item) => item.Key)).toEqual(['c.txt', 'b.txt', 'a.txt']);
    expect(recent._allFiles?.map((item) => item.Key)).toContain('ancient.txt');
    expect(recent.fileOffset).toBe(3);
  });

  it('moves the offset down with the window on a removal', () => {
    store().removeFiles(['b.txt']);

    const recent = store().recentCache['/']!;

    expect(recent.files.map((item) => item.Key)).toEqual(['c.txt', 'a.txt']);
    expect(recent._allFiles).toHaveLength(3);
    expect(recent.fileOffset).toBe(2);
    expect(recent.hasMoreFiles).toBe(true);
  });
});

describe('undoing a change without undoing anyone else', () => {
  beforeEach(() => {
    useDriveStore.setState({
      cache: {
        '/': { files: [file('a.txt'), file('b.txt')], folders: [], isTruncated: false },
      },
    });
  });

  it('takes back only what it added', () => {
    const undo = store().addFile('/', { key: 'new.txt', size: 1 });
    expect(keysAt('/')).toContain('new.txt');

    undo();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });

  it('leaves a concurrent delete in place when an upload is rolled back', () => {
    // The interleaving that a snapshot-restoring undo gets wrong: ten files
    // uploading, two existing files deleted while they are in flight, then one
    // upload fails. Putting back the array as it was before the upload would
    // resurrect both deleted files.
    const undoUpload = store().addFile('/', { key: 'new.txt', size: 1 });
    store().removeFiles(['a.txt', 'b.txt']);

    undoUpload();

    expect(keysAt('/')).toEqual([]);
  });

  it('puts back only the rows a delete removed', () => {
    const undoDelete = store().removeFiles(['a.txt']);
    store().addFile('/', { key: 'new.txt', size: 1 });

    undoDelete();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt', 'new.txt']);
  });

  it('does not duplicate a row when an undo runs twice', () => {
    const undo = store().removeFiles(['a.txt']);

    undo();
    undo();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });
});

describe('renaming', () => {
  it('moves a file to its new place in the order', () => {
    useDriveStore.setState({
      cache: {
        '/': {
          files: [file('a.txt'), file('m.txt'), file('z.txt')],
          folders: [],
          isTruncated: false,
        },
      },
    });

    store().renameFile('a.txt', 'q.txt');

    expect(keysAt('/')).toEqual(['m.txt', 'q.txt', 'z.txt']);
  });

  it('carries the size and timestamp across', () => {
    const original = file('a.txt', 30);
    useDriveStore.setState({
      cache: { '/': { files: [original], folders: [], isTruncated: false } },
    });

    store().renameFile('a.txt', 'renamed.md');

    const [renamed] = store().cache['/']?.files ?? [];
    expect(renamed?.name).toBe('renamed.md');
    expect(renamed?.extension).toBe('md');
    expect(renamed?.lastModified).toEqual(original.lastModified);
  });

  it('restores the original name on undo', () => {
    useDriveStore.setState({
      cache: { '/': { files: [file('a.txt')], folders: [], isTruncated: false } },
    });

    const undo = store().renameFile('a.txt', 'b.txt');
    undo();

    expect(keysAt('/')).toEqual(['a.txt']);
  });

  it('forgets what was cached under a renamed folder', () => {
    useDriveStore.setState({
      cache: {
        '/': { files: [], folders: [folder('docs/')], isTruncated: false },
        'docs/': { files: [file('docs/inner.txt')], folders: [], isTruncated: false },
      },
    });

    store().renameFolder('docs/', 'papers');

    expect(foldersAt('/')).toEqual(['papers/']);
    // Those objects live under a different prefix now, so the listing that
    // described them cannot be served again.
    expect(store().cache['docs/']).toBeUndefined();
  });
});

describe('creating a folder', () => {
  it('places the row in order and takes it back on undo', () => {
    useDriveStore.setState({
      cache: {
        '/': { files: [], folders: [folder('a/'), folder('z/')], isTruncated: false },
      },
    });

    const undo = store().addFolder('/', 'm');
    expect(foldersAt('/')).toEqual(['a/', 'm/', 'z/']);

    undo();
    expect(foldersAt('/')).toEqual(['a/', 'z/']);
  });

  it('nests under the prefix it was created in', () => {
    useDriveStore.setState({
      cache: { 'docs/': { files: [], folders: [], isTruncated: false } },
    });

    store().addFolder('docs/', 'drafts');

    expect(foldersAt('docs/')).toEqual(['docs/drafts/']);
  });
});

describe('statuses left behind by a retired request', () => {
  it('frees a "Show more" that was mid-flight', () => {
    useDriveStore.setState({
      cache: { '/': { files: [file('a.txt')], folders: [], isTruncated: true } },
      directory: { '/': { status: 'loading' } },
      loadMoreStatus: { '/': 'loading' },
    });

    store().removeFiles(['a.txt']);

    // The retired request never writes the 'ready' it would have written, so
    // without this repair the button refuses to run again for good.
    expect(store().loadMoreStatus['/']).toBeUndefined();
    expect(store().directory['/']).toEqual({ status: 'ready' });
  });
});

describe('a silent re-read', () => {
  it('leaves rows on screen when it fails', async () => {
    const fetchDirectoryStructure = vi.fn().mockRejectedValue(new Error('network'));
    useDriveStore.setState({
      currentPrefix: '/',
      rootPrefix: '/',
      cache: { '/': { files: [file('a.txt')], folders: [], isTruncated: false } },
      directory: { '/': { status: 'ready' } },
    });
    store().setApiS3({ fetchDirectoryStructure, getPrefix: () => '' } as never);

    await store().fetchData({ silent: true });

    // toAsyncState reads 'error' before it reads the data, so writing one here
    // would replace a listing the user is reading with a full-page failure
    // notice - over rows that are still perfectly good.
    expect(store().directory['/']).toEqual({ status: 'ready' });
    expect(keysAt('/')).toEqual(['a.txt']);
  });

  it('still reports a failure when there is nothing to show', async () => {
    const fetchDirectoryStructure = vi.fn().mockRejectedValue(new Error('network'));
    useDriveStore.setState({ currentPrefix: '/', rootPrefix: '/', cache: {}, directory: {} });
    store().setApiS3({ fetchDirectoryStructure, getPrefix: () => '' } as never);

    await store().fetchData({ silent: true });

    expect(store().directory['/']?.status).toBe('error');
  });
});

describe('an undo takes back only what its own call did', () => {
  it('leaves a file that was already listed alone', () => {
    useDriveStore.setState({
      cache: { '/': { files: [file('a.txt')], folders: [], isTruncated: false } },
    });

    // An upload that replaced an existing object finds the row already there,
    // so this call added nothing - and an undo that removed it would take out
    // a row this call is not responsible for.
    const undo = store().addFile('/', { key: 'a.txt', size: 5 });
    undo();

    expect(keysAt('/')).toEqual(['a.txt']);
  });

  it('leaves a folder that was already listed alone', () => {
    useDriveStore.setState({
      cache: { '/': { files: [], folders: [folder('docs/')], isTruncated: false } },
    });

    // The "replace" answer to the create-folder duplicate prompt.
    const undo = store().addFolder('/', 'docs');
    undo();

    expect(foldersAt('/')).toEqual(['docs/']);
  });
});

describe('an undo restores what a truncated listing had', () => {
  it('puts back a row that was the last one loaded', () => {
    useDriveStore.setState({
      cache: {
        'x/': {
          files: [file('x/a.txt'), file('x/z.txt')],
          folders: [],
          isTruncated: true,
          nextToken: 'token',
        },
      },
    });

    const undo = store().removeFiles(['x/z.txt']);
    expect(keysAt('x/')).toEqual(['x/a.txt']);

    undo();

    // Removing z left a as the last key, so the truncation guard would have
    // refused to put z back. That guard is about objects the listing has never
    // held, not ones it held a moment ago - and refusing here is a rollback
    // quietly losing a file that was never deleted.
    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/z.txt']);
  });

  it('puts back a renamed row that sorted last', () => {
    useDriveStore.setState({
      cache: {
        'x/': {
          files: [file('x/a.txt'), file('x/z.txt')],
          folders: [],
          isTruncated: true,
          nextToken: 'token',
        },
      },
    });

    const undo = store().renameFile('x/z.txt', 'x/b.txt');
    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/b.txt']);

    undo();

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/z.txt']);
  });
});

describe('renaming onto a name that is already taken', () => {
  beforeEach(() => {
    useDriveStore.setState({
      cache: {
        '/': { files: [file('a.txt'), file('b.txt')], folders: [], isTruncated: false },
      },
    });
  });

  it('leaves the file that was already there alone when undone', () => {
    // The "replace" answer to the rename duplicate prompt: b.txt is listed
    // already, so this call takes a.txt out and adds nothing.
    const undo = store().renameFile('a.txt', 'b.txt');

    undo();

    // An undo that removed b.txt would delete a row this call never added, and
    // b.txt is still a perfectly real file.
    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });

  it('still puts the renamed row back when the name was free', () => {
    const undo = store().renameFile('a.txt', 'c.txt');
    expect(keysAt('/')).toEqual(['b.txt', 'c.txt']);

    undo();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });
});
