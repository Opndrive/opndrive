/**
 * removeDeletedFolder.
 *
 * The drive store caches one listing per prefix and refreshCurrentData only
 * ever refetches the one the user is standing in. Delete a folder from inside
 * it, which is what recovering an interrupted delete after a reload does, and
 * every listing above it keeps offering a folder that is no longer in the
 * bucket until the page is reloaded by hand.
 *
 * These tests pin what the store forgets and, just as importantly, what it
 * keeps: dropping the parent listing as well would leave whoever is looking at
 * it staring at a skeleton, since a fetch only fires when the prefix changes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

function file(key: string): FileItem {
  return {
    Key: key,
    id: key,
    name: key.split('/').pop() ?? '',
    extension: 'txt',
    size: { value: 1, unit: 'B' },
  };
}

function listing(folders: string[], files: string[] = []) {
  return {
    folders: folders.map(folder),
    files: files.map(file),
    isTruncated: false,
  };
}

const store = () => useDriveStore.getState();

beforeEach(() => {
  useDriveStore.setState({ rootPrefix: '/', currentPrefix: '/' });
});

describe('forgetting the folder itself', () => {
  beforeEach(() => {
    useDriveStore.setState({
      cache: {
        '/': listing(['docs/']),
        'docs/': listing(['docs/2024/'], ['docs/a.txt']),
        'docs/2024/': listing([], ['docs/2024/b.txt']),
      },
      status: { '/': 'ready', 'docs/': 'ready', 'docs/2024/': 'ready' },
      loadMoreStatus: { 'docs/': 'ready' },
    });
  });

  it('drops its listing and everything beneath it', () => {
    store().removeDeletedFolder('docs/');

    expect(Object.keys(store().cache)).toEqual(['/']);
  });

  it('drops the statuses too, so nothing is served as ready', () => {
    store().removeDeletedFolder('docs/');

    expect(store().status).toEqual({ '/': 'ready' });
    expect(store().loadMoreStatus).toEqual({});
  });

  it('takes a prefix that arrives without a trailing slash', () => {
    store().removeDeletedFolder('docs');

    expect(Object.keys(store().cache)).toEqual(['/']);
  });

  it('leaves folders that only share the start of the name', () => {
    useDriveStore.setState({
      cache: { '/': listing(['docs/', 'docs-old/']), 'docs-old/': listing([]) },
    });

    store().removeDeletedFolder('docs/');

    expect(Object.keys(store().cache)).toEqual(['/', 'docs-old/']);
    expect(store().cache['/'].folders.map((f) => f.Prefix)).toEqual(['docs-old/']);
  });

  it('refuses to treat the root as a deleted folder', () => {
    store().removeDeletedFolder('/');

    expect(Object.keys(store().cache)).toHaveLength(3);
  });
});

describe('the parent listing', () => {
  it('loses the folder but stays cached, so it still renders', () => {
    useDriveStore.setState({
      cache: { '/': listing(['docs/', 'photos/'], ['readme.md']) },
      status: { '/': 'ready' },
    });

    store().removeDeletedFolder('docs/');

    expect(store().cache['/'].folders.map((f) => f.Prefix)).toEqual(['photos/']);
    expect(store().cache['/'].files.map((f) => f.Key)).toEqual(['readme.md']);
    expect(store().status['/']).toBe('ready');
  });

  it('is found through the bucket prefix the session is pinned to', () => {
    useDriveStore.setState({
      rootPrefix: 'team/',
      currentPrefix: 'team/',
      cache: { 'team/': listing(['team/docs/']), 'team/docs/': listing([]) },
    });

    store().removeDeletedFolder('team/docs/');

    expect(Object.keys(store().cache)).toEqual(['team/']);
    expect(store().cache['team/'].folders).toEqual([]);
  });

  it('is left alone when it was never cached', () => {
    useDriveStore.setState({ cache: { 'docs/': listing([]) } });

    store().removeDeletedFolder('docs/');

    expect(store().cache).toEqual({});
  });
});

describe('the recents on the home page', () => {
  beforeEach(() => {
    useDriveStore.setState({
      recentCache: {
        '/': {
          files: [file('readme.md')],
          folders: [folder('docs/'), folder('photos/')],
          hasMoreFiles: false,
          hasMoreFolders: true,
          fileOffset: 10,
          folderOffset: 2,
          _allFiles: [file('readme.md')],
          _allFolders: [folder('docs/'), folder('photos/'), folder('music/')],
        },
        'docs/': {
          files: [file('docs/a.txt')],
          folders: [],
          hasMoreFiles: false,
          hasMoreFolders: false,
          fileOffset: 10,
          folderOffset: 10,
        },
      },
      recentStatus: { '/': 'ready', 'docs/': 'ready' },
    });
  });

  it('drops the deleted folder from the visible list and the paging list', () => {
    store().removeDeletedFolder('docs/');

    const root = store().recentCache['/'];
    expect(root.folders.map((f) => f.Prefix)).toEqual(['photos/']);
    expect(root._allFolders?.map((f) => f.Prefix)).toEqual(['photos/', 'music/']);
  });

  it('moves the offset with the list, so View more does not skip an item', () => {
    store().removeDeletedFolder('docs/');

    const root = store().recentCache['/'];
    expect(root.folderOffset).toBe(1);
    expect(root.hasMoreFolders).toBe(true);
  });

  it('drops the recents held for the folder itself', () => {
    store().removeDeletedFolder('docs/');

    expect(store().recentCache['docs/']).toBeUndefined();
    expect(store().recentStatus).toEqual({ '/': 'ready' });
  });
});
