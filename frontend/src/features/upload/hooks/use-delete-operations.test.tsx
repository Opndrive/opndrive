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
import type { Folder } from '@/features/dashboard/types/folder';

const listFromPrefix = vi.fn();
const deleteBatch = vi.fn();
const deleteFile = vi.fn();
const refreshCurrentData = vi.fn();
const removeDeletedFolder = vi.fn();
const routerReplace = vi.fn();
const notifyError = vi.fn();

/** Where the user is standing, which is what decides whether a delete moves them. */
const drive = {
  currentPrefix: '/' as string | null,
  rootPrefix: '/' as string | null,
  refreshCurrentData,
  removeDeletedFolder,
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

  it('refreshes in place when the user was somewhere else', async () => {
    const { result } = renderHook(() => useDeleteOperations());
    await act(async () => {
      await result.current.deleteFolderWithProgress(folder());
    });

    expect(routerReplace).not.toHaveBeenCalled();
    expect(refreshCurrentData).toHaveBeenCalled();
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
    expect(refreshCurrentData).toHaveBeenCalled();
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
