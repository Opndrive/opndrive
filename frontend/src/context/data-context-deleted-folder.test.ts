/**
 * removeDeletedFolder.
 *
 * The drive store caches one listing per folder and a refresh only re-reads the
 * one the user is standing in. Delete a folder from inside it, which is what
 * recovering an interrupted delete after a reload does, and every listing above
 * it keeps offering a folder that is no longer in the bucket.
 *
 * These tests pin what the store forgets and, just as importantly, what it
 * keeps: dropping the parent listing as well would leave whoever is looking at
 * it staring at a skeleton, since a fetch only fires when the prefix changes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDriveStore } from './data-context';
import { listingOf } from './folder-listing';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
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

function listing(folders: string[], files: string[] = [], cursor?: string) {
  return listingOf({ folders: folders.map(folder), files: files.map(file), cursor });
}

const store = () => useDriveStore.getState();
const keys = () => Object.keys(store().listings).sort();

beforeEach(() => {
  store().clearAllData();
  useDriveStore.setState({ rootPrefix: '/', currentPrefix: '/' });
});

describe('forgetting the folder itself', () => {
  beforeEach(() => {
    useDriveStore.setState({
      listings: {
        '/': listing(['docs/']),
        'docs/': listing(['docs/2024/'], ['docs/a.txt']),
        'docs/2024/': listing([], ['docs/2024/b.txt']),
      },
    });
  });

  it('drops its listing and everything beneath it, statuses and all', () => {
    store().removeDeletedFolder('docs/');

    // The statuses live on the listing, so nothing under the folder can be
    // served as ready afterwards.
    expect(keys()).toEqual(['/']);
  });

  it('takes a prefix that arrives without a trailing slash', () => {
    store().removeDeletedFolder('docs');

    expect(keys()).toEqual(['/']);
  });

  it('leaves folders that only share the start of the name', () => {
    useDriveStore.setState({
      listings: { '/': listing(['docs/', 'docs-old/']), 'docs-old/': listing([]) },
    });

    store().removeDeletedFolder('docs/');

    expect(keys()).toEqual(['/', 'docs-old/']);
    expect(store().listings['/']!.folders.map((f) => f.Prefix)).toEqual(['docs-old/']);
  });

  it('refuses to treat the root as a deleted folder', () => {
    store().removeDeletedFolder('/');

    expect(keys()).toHaveLength(3);
  });
});

describe('the parent listing', () => {
  it('loses the folder but stays cached and ready, so it still renders', () => {
    useDriveStore.setState({ listings: { '/': listing(['docs/', 'photos/'], ['readme.md']) } });

    store().removeDeletedFolder('docs/');

    const root = store().listings['/']!;
    expect(root.folders.map((f) => f.Prefix)).toEqual(['photos/']);
    expect(root.files.map((f) => f.Key)).toEqual(['readme.md']);
    expect(root.status).toBe('ready');
  });

  it('is found through the bucket prefix the session is pinned to', () => {
    useDriveStore.setState({
      rootPrefix: 'team/',
      currentPrefix: 'team/',
      listings: { 'team/': listing(['team/docs/']), 'team/docs/': listing([]) },
    });

    store().removeDeletedFolder('team/docs/');

    expect(keys()).toEqual(['team/']);
    expect(store().listings['team/']!.folders).toEqual([]);
  });

  it('is left alone when it was never cached', () => {
    useDriveStore.setState({ listings: { 'docs/': listing([]) } });

    store().removeDeletedFolder('docs/');

    expect(store().listings).toEqual({});
  });
});

/**
 * The store stops overlapping reads, so a listing requested before the delete
 * can still be in the air when it lands. Left to arrive, it writes the bucket
 * as it was and the folder is simply back.
 */
describe('a read still in the air', () => {
  /** Resolves only when the test says so, the way a slow response would. */
  function deferredPage() {
    let resolve!: (value: { files: []; folders: { Prefix: string }[] }) => void;
    const promise = new Promise<{ files: []; folders: { Prefix: string }[] }>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it('cannot put the folder back into its parent, and is stopped', async () => {
    const page = deferredPage();
    let signal: AbortSignal | undefined;
    const fetchDirectoryStructure = vi.fn(
      (_prefix: string, _max: number, _token?: string, opts?: { signal?: AbortSignal }) => {
        signal = opts?.signal;
        return page.promise;
      }
    );
    useDriveStore.setState({ apiS3: { fetchDirectoryStructure } as never });

    // The listing goes out before the delete, and still has the folder in it.
    const reading = store().fetchData({ sync: true });

    store().removeDeletedFolder('docs/');
    expect(signal?.aborted).toBe(true);

    page.resolve({ files: [], folders: [{ Prefix: 'docs/' }] });
    await reading;

    expect(store().listings['/']?.folders ?? []).toEqual([]);
  });

  it('leaves the parent able to page again, not stuck mid load', async () => {
    const page = deferredPage();
    const fetchDirectoryStructure = vi.fn().mockReturnValue(page.promise);
    useDriveStore.setState({
      apiS3: { fetchDirectoryStructure } as never,
      listings: { '/': listing(['docs/'], [], 'page-2') },
    });

    // The next page is already being read when the delete lands.
    const paging = store().loadMoreData();
    expect(store().listings['/']!.nextPage.status).toBe('loading');

    store().removeDeletedFolder('docs/');

    page.resolve({ files: [], folders: [] });
    await paging;

    // A next page that reads as loading for good never starts again.
    expect(store().listings['/']!.nextPage.status).toBe('idle');
  });

  it('leaves the parent listing showing, not stuck behind its skeleton', async () => {
    const page = deferredPage();
    const fetchDirectoryStructure = vi.fn().mockReturnValue(page.promise);
    useDriveStore.setState({
      apiS3: { fetchDirectoryStructure } as never,
      listings: { '/': listing(['docs/', 'photos/']) },
    });

    const reading = store().fetchData({ sync: true });
    expect(store().listings['/']!.status).toBe('loading');

    store().removeDeletedFolder('docs/');

    page.resolve({ files: [], folders: [{ Prefix: 'docs/' }] });
    await reading;

    expect(store().listings['/']!.status).toBe('ready');
    expect(store().listings['/']!.folders.map((f) => f.Prefix)).toEqual(['photos/']);
  });

  it('cannot bring the deleted folder listing back to life', async () => {
    const page = deferredPage();
    const fetchDirectoryStructure = vi.fn().mockReturnValue(page.promise);
    useDriveStore.setState({
      apiS3: { fetchDirectoryStructure } as never,
      currentPrefix: 'docs/2024/',
    });

    const reading = store().fetchData({ sync: true });

    store().removeDeletedFolder('docs/');

    page.resolve({ files: [], folders: [] });
    await reading;

    // A resurrected entry reads as ready and gets served to whoever walks back in.
    expect(store().listings['docs/2024/']).toBeUndefined();
  });
});

/**
 * A folder can be deleted straight from a search result, so this runs while the
 * user is reading that list. clearCache would drop the query it is derived from
 * and empty the page out from under them.
 */
describe('an active search', () => {
  it('survives the delete', () => {
    useSearchStore.getState().setSearchResults('report', '', {
      files: [{ Key: 'docs/report.xlsx' } as never],
      folders: [],
      totalFiles: 1,
      totalFolders: 0,
      totalKeys: 1,
      isTruncated: false,
    });
    useSearchStore.getState().setCurrentQuery('report', '');

    store().removeDeletedFolder('docs/');

    expect(useSearchStore.getState().currentQuery).toBe('report');
    expect(useSearchStore.getState().getCachedOrNull('report', '')).not.toBeNull();
  });
});
