/**
 * Localized edits to the drive's listings.
 *
 * Uploads, deletes, renames and new folders edit the affected folder's rows in
 * place instead of re-listing it. What is pinned here is mostly the ways that
 * edit can go wrong: matching a file by prefix instead of by whole key,
 * inserting into a page nobody has read yet, and undoing a change by restoring
 * a snapshot that also undoes everyone else's.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDriveStore } from './data-context';
import { listingOf } from './folder-listing';
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
const keysAt = (prefix: string) => store().listings[prefix]?.files.map((item) => item.Key);
const foldersAt = (prefix: string) => store().listings[prefix]?.folders.map((item) => item.Prefix);

/** Seeds listings: `cursor` set means more pages remain. */
function seed(
  listings: Record<string, { files?: FileItem[]; folders?: Folder[]; cursor?: string }>
) {
  useDriveStore.setState({
    listings: Object.fromEntries(
      Object.entries(listings).map(([key, rows]) => [key, listingOf(rows)])
    ),
  });
}

beforeEach(() => {
  store().clearAllData();
  useDriveStore.setState({ rootPrefix: '/', currentPrefix: '/' });
});

describe('removing files by whole key', () => {
  beforeEach(() => {
    seed({ '/': { files: [file('report.pdf'), file('report.pdf.bak'), file('notes.txt')] } });
  });

  it('takes out only the file named', () => {
    store().removeFiles(['report.pdf']);

    expect(keysAt('/')).toEqual(['report.pdf.bak', 'notes.txt']);
  });

  it('leaves a listing alone when nothing matches', () => {
    const before = store().listings['/'];
    store().removeFiles(['absent.txt']);

    // Same object, not merely an equal one: a change aimed elsewhere must not
    // re-render the folder on screen.
    expect(store().listings['/']).toBe(before);
  });

  it('routes each key to the listing that holds it', () => {
    seed({ '/': { files: [file('a.txt')] }, 'docs/': { files: [file('docs/b.txt')] } });

    store().removeFiles(['a.txt', 'docs/b.txt']);

    expect(keysAt('/')).toEqual([]);
    expect(keysAt('docs/')).toEqual([]);
  });
});

describe('inserting into a listing with pages still to read', () => {
  beforeEach(() => {
    seed({ 'x/': { files: [file('x/a.txt'), file('x/m.txt')], cursor: 'token' } });
  });

  it('skips a key belonging to a page nobody has read', () => {
    store().addFile('x/', { key: 'x/z.txt', size: 10 });

    // 'z' sorts past the last key read, so the real object is in a page still
    // to come. Placing it here would make that page's row a duplicate, dropped
    // in favour of this guess.
    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/m.txt']);
  });

  it('still places a key that falls inside what was read', () => {
    store().addFile('x/', { key: 'x/b.txt', size: 10 });

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/b.txt', 'x/m.txt']);
  });

  it('counts a folder read past the last file as part of what was read', () => {
    // The page ended on a folder: everything up to it has been seen.
    seed({ 'x/': { files: [file('x/a.txt')], folders: [folder('x/q/')], cursor: 'token' } });

    store().addFile('x/', { key: 'x/p.txt', size: 10 });

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/p.txt']);
  });

  it('places a key past the end once the listing is complete', () => {
    seed({ 'x/': { files: [file('x/a.txt')] } });

    store().addFile('x/', { key: 'x/z.txt', size: 10 });

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/z.txt']);
  });

  it('leaves the server cursor alone when removing', () => {
    store().removeFiles(['x/a.txt']);

    // The cursor marks where S3 stopped, not what we are holding.
    expect(store().listings['x/']?.cursor).toBe('token');
    expect(store().listings['x/']?.complete).toBe(false);
  });
});

describe('undoing a change without undoing anyone else', () => {
  beforeEach(() => {
    seed({ '/': { files: [file('a.txt'), file('b.txt')] } });
  });

  it('takes back only what it added', () => {
    const undo = store().addFile('/', { key: 'new.txt', size: 1 });
    expect(keysAt('/')).toContain('new.txt');

    undo();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });

  it('leaves a concurrent delete in place when an upload is rolled back', () => {
    // Putting back the array as it was before the upload would resurrect both
    // files deleted while it was in flight.
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
    seed({ '/': { files: [file('a.txt'), file('m.txt'), file('z.txt')] } });

    store().renameFile('a.txt', 'q.txt');

    expect(keysAt('/')).toEqual(['m.txt', 'q.txt', 'z.txt']);
  });

  it('carries the size and timestamp across', () => {
    const original = file('a.txt', 30);
    seed({ '/': { files: [original] } });

    store().renameFile('a.txt', 'renamed.md');

    const [renamed] = store().listings['/']?.files ?? [];
    expect(renamed?.name).toBe('renamed.md');
    expect(renamed?.extension).toBe('md');
    expect(renamed?.lastModified).toEqual(original.lastModified);
  });

  it('restores the original name on undo', () => {
    seed({ '/': { files: [file('a.txt')] } });

    const undo = store().renameFile('a.txt', 'b.txt');
    undo();

    expect(keysAt('/')).toEqual(['a.txt']);
  });

  it('forgets what was cached under a renamed folder', () => {
    seed({ '/': { folders: [folder('docs/')] }, 'docs/': { files: [file('docs/inner.txt')] } });

    store().renameFolder('docs/', 'papers');

    expect(foldersAt('/')).toEqual(['papers/']);
    // Those objects live under a different prefix now.
    expect(store().listings['docs/']).toBeUndefined();
  });
});

describe('creating a folder', () => {
  it('places the row in order and takes it back on undo', () => {
    seed({ '/': { folders: [folder('a/'), folder('z/')] } });

    const undo = store().addFolder('/', 'm');
    expect(foldersAt('/')).toEqual(['a/', 'm/', 'z/']);

    undo();
    expect(foldersAt('/')).toEqual(['a/', 'z/']);
  });

  it('nests under the prefix it was created in', () => {
    seed({ 'docs/': {} });

    store().addFolder('docs/', 'drafts');

    expect(foldersAt('docs/')).toEqual(['docs/drafts/']);
  });
});

describe('statuses left behind by a stopped request', () => {
  it('frees a next page and a first page that were mid-flight', () => {
    useDriveStore.setState({
      listings: {
        '/': {
          ...listingOf({ files: [file('a.txt')], cursor: 'token' }),
          status: 'loading',
          nextPage: { status: 'loading' },
        },
      },
    });

    store().removeFiles(['a.txt']);

    // The stopped request never writes the 'ready' it would have written, so
    // without this the next page refuses to start again for good.
    expect(store().listings['/']!.nextPage.status).toBe('idle');
    expect(store().listings['/']!.status).toBe('ready');
  });
});

describe('a silent re-read', () => {
  it('leaves rows on screen when it fails', async () => {
    const fetchDirectoryStructure = vi.fn().mockRejectedValue(new Error('network'));
    seed({ '/': { files: [file('a.txt')] } });
    store().setApiS3({ fetchDirectoryStructure, getPrefix: () => '' } as never);

    await store().fetchData({ silent: true });

    // An 'error' here would replace a listing the user is reading with a
    // full-page failure notice - over rows that are still perfectly good.
    expect(store().listings['/']!.status).toBe('ready');
    expect(keysAt('/')).toEqual(['a.txt']);
  });

  it('still reports a failure when there is nothing to show', async () => {
    const fetchDirectoryStructure = vi.fn().mockRejectedValue(new Error('network'));
    store().setApiS3({ fetchDirectoryStructure, getPrefix: () => '' } as never);

    await store().fetchData({ silent: true });

    expect(store().listings['/']?.status).toBe('error');
  });
});

describe('an undo takes back only what its own call did', () => {
  it('leaves a file that was already listed alone', () => {
    seed({ '/': { files: [file('a.txt')] } });

    // An upload that replaced an existing object finds the row already there.
    const undo = store().addFile('/', { key: 'a.txt', size: 5 });
    undo();

    expect(keysAt('/')).toEqual(['a.txt']);
  });

  it('leaves a folder that was already listed alone', () => {
    seed({ '/': { folders: [folder('docs/')] } });

    const undo = store().addFolder('/', 'docs');
    undo();

    expect(foldersAt('/')).toEqual(['docs/']);
  });
});

describe('an undo restores what a partly read listing had', () => {
  it('puts back a row that was the last one loaded', () => {
    seed({ 'x/': { files: [file('x/a.txt'), file('x/z.txt')], cursor: 'token' } });

    const undo = store().removeFiles(['x/z.txt']);
    expect(keysAt('x/')).toEqual(['x/a.txt']);

    undo();

    // With z gone, a is the last key, so the loaded-range rule alone would
    // refuse to put z back - a rollback quietly losing a file never deleted.
    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/z.txt']);
  });

  it('puts back a renamed row that sorted last', () => {
    seed({ 'x/': { files: [file('x/a.txt'), file('x/z.txt')], cursor: 'token' } });

    const undo = store().renameFile('x/z.txt', 'x/b.txt');
    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/b.txt']);

    undo();

    expect(keysAt('x/')).toEqual(['x/a.txt', 'x/z.txt']);
  });
});

describe('renaming onto a name that is already taken', () => {
  beforeEach(() => {
    seed({ '/': { files: [file('a.txt'), file('b.txt')] } });
  });

  it('leaves the file that was already there alone when undone', () => {
    const undo = store().renameFile('a.txt', 'b.txt');

    undo();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });

  it('still puts the renamed row back when the name was free', () => {
    const undo = store().renameFile('a.txt', 'c.txt');
    expect(keysAt('/')).toEqual(['b.txt', 'c.txt']);

    undo();

    expect(keysAt('/')).toEqual(['a.txt', 'b.txt']);
  });
});
