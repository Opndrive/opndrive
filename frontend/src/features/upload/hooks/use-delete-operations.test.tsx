/**
 * useDeleteOperations - folder delete ordering.
 *
 * S3 returns keys in lexicographic order, so a folder's own marker object
 * ("docs/") sorts ahead of everything inside it and used to be deleted in the
 * first batch. An interrupted delete then left the folder invisible while its
 * contents were still in the bucket and still billed. The marker now goes last,
 * and these tests pin that against the real batching loop rather than trusting
 * the order the lister happened to return.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeleteOperations } from './use-delete-operations';
import type { Folder } from '@/features/dashboard/types/folder';

const listFromPrefix = vi.fn();
const deleteBatch = vi.fn();
const deleteFile = vi.fn();
const refreshCurrentData = vi.fn();
const notifyError = vi.fn();

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({
    apiS3: { listFromPrefix, deleteBatch, deleteFile, getBucketName: () => 'test-bucket' },
  }),
}));

vi.mock('@/context/data-context', () => ({
  useDriveStore: () => ({ refreshCurrentData }),
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

beforeEach(() => {
  listFromPrefix.mockReset();
  deleteBatch.mockReset().mockResolvedValue({ requested: 0, deleted: 0, errors: [] });
  deleteFile.mockReset().mockResolvedValue(undefined);
  refreshCurrentData.mockReset();
  notifyError.mockReset();
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
