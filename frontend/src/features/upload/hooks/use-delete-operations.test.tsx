/**
 * useDeleteOperations - folder delete ordering and the recovery record.
 *
 * S3 returns keys in lexicographic order, so a folder's own marker object
 * ("docs/") sorts ahead of everything inside it and used to be deleted in the
 * first batch. An interrupted delete then left the folder invisible while its
 * contents were still in the bucket and still billed. The marker now goes last,
 * and these tests pin that against the real batching loop rather than trusting
 * the order the lister happened to return.
 *
 * The second half covers the record that makes an interruption noticeable at
 * all. A tab close cannot be simulated, so the test samples the store from
 * inside the batch loop: whatever is there mid-run is exactly what would be
 * left behind.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeleteOperations } from './use-delete-operations';
import { useDeleteRecoveryStore } from '../stores/use-delete-recovery-store';
import { useUploadStore } from '../stores/use-upload-store';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

const listFromPrefix = vi.fn();
const deleteBatch = vi.fn();
const deleteFile = vi.fn();
const refreshCurrentData = vi.fn();
const removeDeletedFolder = vi.fn();
const routerReplace = vi.fn();
/** Returns its undo, the way the real mutator does. */
const removeFiles = vi.fn(() => vi.fn());
const notifyError = vi.fn();

/** Where the user is standing, which is what decides whether a delete moves them. */
const drive = {
  currentPrefix: '/' as string | null,
  rootPrefix: '/' as string | null,
  refreshCurrentData,
  removeDeletedFolder,
  removeFiles,
};

const route = { pathname: '/dashboard/browse' };

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({
    apiS3: { listFromPrefix, deleteBatch, deleteFile, getBucketName: () => 'test-bucket' },
  }),
}));

vi.mock('@/context/data-context', () => ({
  // Selector and getState both read the same object, the way the real store does
  useDriveStore: Object.assign(
    (selector?: (state: typeof drive) => unknown) => (selector ? selector(drive) : drive),
    { getState: () => drive }
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => route.pathname,
}));

vi.mock('@/context/notification-context', () => ({
  useNotification: () => ({
    error: notifyError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'docs',
    name: 'docs',
    Prefix: 'docs/',
    location: { type: 'my-drive', label: 'My Drive' },
    ...overrides,
  };
}

/** The keys handed to deleteBatch, call by call, flattened back to plain keys. */
function batchedKeys(): string[][] {
  return deleteBatch.mock.calls.map((call) => (call[0] as { Key: string }[]).map((o) => o.Key));
}

const records = () => useDeleteRecoveryStore.getState().records;

beforeEach(() => {
  listFromPrefix.mockReset();
  deleteBatch.mockReset().mockResolvedValue({ requested: 0, deleted: 0, errors: [] });
  deleteFile.mockReset().mockResolvedValue(undefined);
  refreshCurrentData.mockReset();
  removeDeletedFolder.mockReset();
  routerReplace.mockReset();
  notifyError.mockReset();
  drive.currentPrefix = '/';
  drive.rootPrefix = '/';
  route.pathname = '/dashboard/browse';
  useDeleteRecoveryStore.setState({ records: {} });
});

describe('folder marker ordering', () => {
  it('deletes the marker after everything it contains', async () => {
    // Lexicographic order, which is what S3 actually returns
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt', 'docs/b.txt']);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(batchedKeys()).toEqual([['docs/a.txt', 'docs/b.txt', 'docs/']]);
  });

  it('puts the marker in the final batch when the folder spans several', async () => {
    const contents = Array.from({ length: 1001 }, (_, i) => `docs/file-${i}.txt`);
    listFromPrefix.mockResolvedValue(['docs/', ...contents]);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    const batches = batchedKeys();
    expect(batches).toHaveLength(2);
    expect(batches[0]).not.toContain('docs/');
    expect(batches[1].at(-1)).toBe('docs/');
  });

  it('still deletes the marker when the lister does not return one', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(batchedKeys()).toEqual([['docs/a.txt', 'docs/']]);
  });

  it('never sends the marker twice', async () => {
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt']);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    const sent = batchedKeys().flat();
    expect(sent.filter((key) => key === 'docs/')).toHaveLength(1);
  });

  it('handles an empty folder that only has a marker', async () => {
    listFromPrefix.mockResolvedValue([]);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(batchedKeys()).toEqual([['docs/']]);
  });

  it('normalizes a prefix that arrives without a trailing slash', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder({ Prefix: 'docs' }));
    });

    expect(listFromPrefix).toHaveBeenCalledWith('docs/');
    expect(batchedKeys()).toEqual([['docs/a.txt', 'docs/']]);
  });
});

/**
 * A delete leaves every cached listing that mentioned the folder wrong, not
 * just the one on screen, and the user can be standing inside the folder while
 * it goes. Both are the same cleanup step.
 */
describe('after the folder is gone', () => {
  beforeEach(() => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);
  });

  it('forgets the folder wherever it was cached', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(removeDeletedFolder).toHaveBeenCalledWith('docs/');
  });

  it('corrects the listing in place when the user was somewhere else', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(routerReplace).not.toHaveBeenCalled();
    // removeDeletedFolder has already taken the row out of the parent listing,
    // so re-reading the prefix would spend two full listings confirming what
    // the store was just told.
    expect(removeDeletedFolder).toHaveBeenCalledWith('docs/');
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('steps out to the parent when the user was inside it', async () => {
    drive.currentPrefix = 'docs/2024/raw/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(routerReplace).toHaveBeenCalledWith('/dashboard');
    // Nothing left at that prefix, so refetching it would only prove it is empty
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('steps out of the folder itself, not only from below it', async () => {
    drive.currentPrefix = 'docs/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(routerReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('lands on the nearest surviving folder, not the root', async () => {
    listFromPrefix.mockResolvedValue(['photos/2024/a.jpg']);
    drive.currentPrefix = 'photos/2024/raw/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(
        folder({ id: 'photos/2024/', name: '2024', Prefix: 'photos/2024/' })
      );
    });

    expect(routerReplace).toHaveBeenCalledWith('/dashboard/browse?prefix=photos%2F');
  });

  it('keeps the URL relative to the bucket prefix the session is pinned to', async () => {
    listFromPrefix.mockResolvedValue(['team/docs/a.txt']);
    drive.rootPrefix = 'team/';
    drive.currentPrefix = 'team/docs/2024/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(
        folder({ id: 'team/docs/', Prefix: 'team/docs/' })
      );
    });

    expect(routerReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('stays put when the user is in a folder that only starts the same', async () => {
    drive.currentPrefix = 'docs-old/2024/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(routerReplace).not.toHaveBeenCalled();
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('does not throw the user out of their search results', async () => {
    // Search lists folders from anywhere in the bucket, while the store still
    // points at the last folder browsed
    route.pathname = '/dashboard/search';
    drive.currentPrefix = 'docs/2024/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(routerReplace).not.toHaveBeenCalled();
    expect(removeDeletedFolder).toHaveBeenCalledWith('docs/');
  });

  it('leaves everything alone when S3 refused part of the delete', async () => {
    deleteBatch.mockResolvedValue({
      requested: 2,
      deleted: 1,
      errors: [{ key: 'docs/a.txt', code: 'AccessDenied', message: 'nope' }],
    });
    drive.currentPrefix = 'docs/2024/';

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.deleteFolderWithProgress(folder())).rejects.toThrow();
    });

    expect(removeDeletedFolder).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe('recovery record', () => {
  it('exists while the batches are going out, which is the interrupted case', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);

    // Sampled from inside the loop: this is what a tab close would leave behind
    let recordDuringRun: unknown;
    deleteBatch.mockImplementation(async () => {
      recordDuringRun = Object.values(records())[0];
      return { requested: 1, deleted: 1, errors: [] };
    });

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(recordDuringRun).toMatchObject({
      bucket: 'test-bucket',
      prefix: 'docs/',
      name: 'docs',
    });
  });

  it('is cleared once the delete finishes', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(records()).toEqual({});
  });

  it('is cleared when the delete throws, since the user was told', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);
    deleteBatch.mockRejectedValue(new Error('access denied'));

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.deleteFolderWithProgress(folder())).rejects.toThrow();
    });

    expect(records()).toEqual({});
  });

  it('is cleared when S3 refuses some of the objects', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);
    deleteBatch.mockResolvedValue({
      requested: 2,
      deleted: 1,
      errors: [{ key: 'docs/a.txt', code: 'AccessDenied', message: 'nope' }],
    });

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.deleteFolderWithProgress(folder())).rejects.toThrow();
    });

    expect(records()).toEqual({});
  });

  it('pins the bucket the delete was aimed at', async () => {
    listFromPrefix.mockResolvedValue(['docs/a.txt']);

    let bucketDuringRun: unknown;
    deleteBatch.mockImplementation(async () => {
      bucketDuringRun = (Object.values(records())[0] as { bucket: string }).bucket;
      return { requested: 1, deleted: 1, errors: [] };
    });

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(bucketDuringRun).toBe('test-bucket');
  });
});

describe('deleting one file', () => {
  function doc(): FileItem {
    return {
      id: 'docs/a.txt',
      Key: 'docs/a.txt',
      name: 'a.txt',
      extension: 'txt',
      size: { value: 1, unit: 'B' },
    };
  }

  it('takes the row out instead of re-listing the folder', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFileWithProgress(doc());
    });

    expect(removeFiles).toHaveBeenCalledWith(['docs/a.txt']);
    // Two full listings of a thousand objects, to learn one row had gone.
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('removes the row before the request goes out', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFileWithProgress(doc());
    });

    // Optimistic: the row goes the moment the user asks, not a round trip later.
    expect(removeFiles.mock.invocationCallOrder[0]!).toBeLessThan(
      deleteFile.mock.invocationCallOrder[0]!
    );
  });

  it('puts the row back when the delete is refused', async () => {
    const undo = vi.fn();
    removeFiles.mockReturnValueOnce(undo);
    deleteFile.mockRejectedValueOnce(new Error('AccessDenied'));

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.deleteFileWithProgress(doc())).rejects.toThrow('AccessDenied');
    });

    // One call, one object: it did not happen, so the row is owed back.
    expect(undo).toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });
});

/**
 * What the card claims to be deleting.
 *
 * Batch deletes used to hardcode `type: 'folder'` to get *an* icon, with the
 * comment "Use folder icon for batch operations". So deleting a single photo
 * drew a folder, and a selection of eight files drew a folder next to a label
 * that correctly read "Deleting 8 files".
 */
describe('what the delete card says it is deleting', () => {
  const card = () => Object.values(useUploadStore.getState().deletes)[0]!;

  function item(key: string, name?: string): FileItem {
    return {
      Key: key,
      id: key,
      name: name ?? key.split('/').filter(Boolean).pop() ?? key,
      extension: 'txt',
      size: { value: 1, unit: 'B' },
    };
  }

  it('names the one thing being deleted rather than counting it', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([item('docs/report.pdf')]);
    });

    // "1 item" next to a folder icon told the user nothing about the photo
    // they had just deleted.
    expect(card().name).toBe('report.pdf');
    expect(card().type).toBe('file');
  });

  it('does not call a selection of files a folder', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([item('docs/a.txt'), item('docs/b.txt')]);
    });

    expect(card().type).toBe('file');
    expect(card().name).toBe('2 items');
    expect(card().operationLabel).toBe('Deleting 2 files');
  });

  it('treats a folder marker as a folder, however file-shaped it is', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([item('photos/', 'photos')]);
    });

    // A zero-byte object whose key ends in a slash is a folder to anyone
    // looking at it. The trailing slash is the only thing that says so.
    expect(card().type).toBe('folder');
  });

  it('says mixed when the selection is both', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([item('docs/a.txt'), item('photos/', 'photos')]);
    });

    expect(card().type).toBe('mixed');
    expect(card().operationLabel).toBe('Deleting 1 file and 1 folder');
  });
});

describe('a partial failure names the objects that survived', () => {
  const card = () => Object.values(useUploadStore.getState().deletes)[0]!;

  function item(key: string): FileItem {
    return {
      Key: key,
      id: key,
      name: key.split('/').pop() ?? key,
      extension: 'txt',
      size: { value: 1, unit: 'B' },
    };
  }

  it('lists the failures rather than only the first', async () => {
    deleteBatch.mockResolvedValue({
      requested: 3,
      deleted: 0,
      errors: [
        { key: 'docs/a.txt', code: 'AccessDenied' },
        { key: 'docs/b.txt', code: 'ObjectLockRetention' },
        { key: 'docs/c.txt', code: 'AccessDenied' },
      ],
    });

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(
        result.current.batchDelete([item('docs/a.txt'), item('docs/b.txt'), item('docs/c.txt')])
      ).rejects.toThrow();
    });

    // Every one of these came back inside the DeleteObjects response that did
    // the deleting, so naming them costs nothing. Asking afterwards whether
    // each object was still there would be one HEAD per object.
    const summary = card().error ?? '';
    expect(summary).toContain('docs/a.txt');
    expect(summary).toContain('docs/b.txt');
    expect(summary).toContain('docs/c.txt');
    expect(summary).toContain('AccessDenied');
    expect(summary).toContain('ObjectLockRetention');
  });

  it('counts the rest once the list would get too long', async () => {
    const keys = Array.from({ length: 6 }, (_, i) => `docs/f${i}.txt`);
    deleteBatch.mockResolvedValue({
      requested: 6,
      deleted: 0,
      errors: keys.map((key) => ({ key, code: 'AccessDenied' })),
    });

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.batchDelete(keys.map(item))).rejects.toThrow();
    });

    // Three named, three counted. This string goes on a card, and a failed
    // batch can run to hundreds.
    expect(card().error).toContain('and 3 more');
  });
});

describe('a batch of one kind of file keeps that kind of icon', () => {
  const card = () => Object.values(useUploadStore.getState().deletes)[0]!;

  function item(key: string): FileItem {
    const name = key.split('/').filter(Boolean).pop() ?? key;
    return {
      Key: key,
      id: key,
      name,
      extension: name.split('.').pop() ?? '',
      size: { value: 1, unit: 'B' },
    };
  }

  it('carries the shared extension so eight json files draw a json icon', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete(
        Array.from({ length: 8 }, (_, i) => item(`docs/f${i}.json`))
      );
    });

    // The card is named "8 items", which has no extension to read back off it.
    // Without the shared one carried here, FileIcon falls through to its
    // unknown-type question mark - which reads as an error, not as eight files.
    expect(card().type).toBe('file');
    expect(card().extension).toBe('json');
  });

  it('does not pick one kind when the selection is several', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([item('docs/a.json'), item('docs/b.pdf')]);
    });

    // No single icon here is true of both, so neither gets claimed.
    expect(card().type).toBe('mixed');
    expect(card().extension).toBeUndefined();
  });
});

describe('the card names what it is deleting', () => {
  const card = () => Object.values(useUploadStore.getState().deletes)[0]!;

  function item(key: string): FileItem {
    const name = key.split('/').filter(Boolean).pop() ?? key;
    return {
      Key: key,
      id: key,
      name,
      extension: name.split('.').pop() ?? '',
      size: { value: 1, unit: 'B' },
    };
  }

  it('lists the names behind the count', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([
        item('docs/report.json'),
        item('docs/data.json'),
        item('docs/config.json'),
      ]);
    });

    // "3 items" is true and useless: it does not say whether the three you
    // picked are the three you meant.
    expect(card().detail).toBe('report.json\ndata.json\nconfig.json');
  });

  it('lists every name while the tooltip can hold them', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete(
        Array.from({ length: 8 }, (_, i) => item(`docs/f${i}.json`))
      );
    });

    expect(card().detail?.split('\n')).toHaveLength(8);
  });

  it('counts the rest once there are more than it can hold', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete(
        Array.from({ length: 20 }, (_, i) => item(`docs/f${i}.json`))
      );
    });

    // Nothing can scroll the tooltip - it is pointer-transparent by design -
    // so a selection of twenty has to stop somewhere rather than run off the
    // top of the screen.
    const lines = card().detail?.split('\n') ?? [];
    expect(lines).toHaveLength(13);
    expect(lines[12]).toBe('and 8 more');
  });

  it('says nothing extra when there is only one thing', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.batchDelete([item('docs/only.json')]);
    });

    // The name IS the file. Repeating it underneath would be noise.
    expect(card().name).toBe('only.json');
    expect(card().detail).toBeUndefined();
  });
});

describe('how far a failed batch got decides what happens to the rows', () => {
  function item(key: string): FileItem {
    return {
      Key: key,
      id: key,
      name: key.split('/').pop() ?? key,
      extension: 'txt',
      size: { value: 1, unit: 'B' },
    };
  }

  it('puts the rows back when the first batch never went through', async () => {
    const undo = vi.fn();
    removeFiles.mockReturnValueOnce(undo);
    deleteBatch.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.batchDelete([item('docs/a.txt')])).rejects.toThrow('network');
    });

    // Nothing reached the bucket, so every row is owed back. Flagging dispatch
    // before the request instead read this as a partial success and resynced -
    // and the resync is deliberately silent, so offline it changed nothing and
    // the rows stayed gone having never been deleted at all.
    expect(undo).toHaveBeenCalled();
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('asks the bucket once a batch has actually gone through', async () => {
    const undo = vi.fn();
    removeFiles.mockReturnValueOnce(undo);
    // Over the 1000-key chunk size, so there are two batches: the first lands,
    // the second does not.
    deleteBatch
      .mockResolvedValueOnce({ requested: 1000, deleted: 1000, errors: [] })
      .mockRejectedValueOnce(new Error('network'));

    const keys = Array.from({ length: 1001 }, (_, i) => item(`docs/f${i}.txt`));

    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await expect(result.current.batchDelete(keys)).rejects.toThrow('network');
    });

    // A thousand of them really are gone. Putting every row back would be as
    // wrong as leaving them all out, so the bucket is asked instead.
    expect(undo).not.toHaveBeenCalled();
    expect(refreshCurrentData).toHaveBeenCalledWith({ silent: true });
  });
});
