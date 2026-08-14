/**
 * Delete lifetime: what stops a running delete, and what must not.
 *
 * The loop captures the S3 client it started with in a closure, so nothing
 * that happens to the provider afterwards reaches it. The abort signal is the
 * only handle on a delete once it is moving, which makes the two halves of
 * this suite a matched pair:
 *
 *   - ending the session MUST stop it, or objects keep being deleted under
 *     credentials the user has already signed out of;
 *   - unmounting the component MUST NOT, or every route change silently
 *     abandons a large delete halfway through.
 *
 * S3 is mocked at the module boundary. Nothing here depends on real bucket
 * behaviour - what is being tested is who can stop the loop and when.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDeleteOperations } from './use-delete-operations';
import { useUploadStore } from '../stores/use-upload-store';

const { refreshCurrentData, notifyError } = vi.hoisted(() => ({
  refreshCurrentData: vi.fn(async () => {}),
  notifyError: vi.fn(),
}));

vi.mock('@opndrive/s3-api', () => ({
  UploadManager: class {},
  SignedUrlUploadManager: class {},
  BYOS3ApiProvider: class {},
}));

vi.mock('@/context/data-context', () => {
  const state = { refreshCurrentData };
  // Used as a hook by the delete hook and as `.getState()` by the store.
  const useDriveStore = Object.assign(() => state, { getState: () => state });
  return { useDriveStore };
});

vi.mock('@/context/notification-context', () => ({
  useNotification: () => ({ error: notifyError }),
}));

const apiS3 = {
  listFromPrefix: vi.fn(async (_prefix: string) => [] as string[]),
  deleteBatch: vi.fn(async (_batch: { Key: string }[]) => ({
    requested: 0,
    deleted: 0,
    errors: [],
  })),
  deleteFile: vi.fn(async (_key: string) => {}),
};

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({ apiS3 }),
}));

const store = () => useUploadStore.getState();

const folder = { name: 'docs', Prefix: 'docs/' } as never;

/** Keys for a folder big enough to need `count / 1000` batches. */
function keys(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `docs/file-${i}.txt`);
}

/** The id of the single operation the hook just registered. */
function onlyOperationId(): string {
  const ids = Object.keys(store().deletes);
  expect(ids).toHaveLength(1);
  return ids[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiS3.listFromPrefix.mockResolvedValue([]);
  apiS3.deleteBatch.mockResolvedValue({ requested: 0, deleted: 0, errors: [] });
  apiS3.deleteFile.mockResolvedValue(undefined);
});

describe('a delete must survive its component', () => {
  it('does not abort when the route that started it unmounts', async () => {
    // Park the delete on the listing so it is genuinely mid-flight at unmount.
    let releaseListing!: (value: string[]) => void;
    apiS3.listFromPrefix.mockReturnValue(
      new Promise<string[]>((resolve) => {
        releaseListing = resolve;
      })
    );

    const { result, unmount } = renderHook(() => useDeleteOperations());

    let deleting!: Promise<void>;
    act(() => {
      deleting = result.current.deleteFolderWithProgress(folder);
    });

    const id = onlyOperationId();
    const signal = store().getDeleteAbortController(id)!.signal;

    unmount();

    // Navigating from Browse to Search must not abandon a 10,000 object delete
    // halfway through, leaving the folder half deleted with no record.
    expect(signal.aborted).toBe(false);

    releaseListing(keys(3));
    await act(async () => {
      await deleting;
    });

    // And it still finishes, with the component long gone.
    expect(apiS3.deleteBatch).toHaveBeenCalledTimes(1);
    expect(store().deletes[id]!.status).toBe('completed');
  });
});

describe('a delete must not survive its session', () => {
  it('stops issuing batches once the session ends', async () => {
    // Three chunks of 1000. Ending the session during the first one must stop
    // the other two from ever being requested.
    apiS3.listFromPrefix.mockResolvedValue(keys(2500));
    apiS3.deleteBatch.mockImplementation(async (batch) => {
      // Exactly what logout does, landing while a batch is in flight.
      if (apiS3.deleteBatch.mock.calls.length === 1) {
        store().clearSessionData();
      }
      return { requested: batch.length, deleted: batch.length, errors: [] };
    });

    const { result } = renderHook(() => useDeleteOperations());

    await act(async () => {
      await result.current.deleteFolderWithProgress(folder);
    });

    // The whole point: the remaining 1500 keys are never requested with the
    // credentials of a session the user has already left.
    expect(apiS3.deleteBatch).toHaveBeenCalledTimes(1);
  });

  it('reports nothing and refreshes nothing after the session ends', async () => {
    apiS3.listFromPrefix.mockResolvedValue(keys(2500));
    apiS3.deleteBatch.mockImplementation(async (batch) => {
      if (apiS3.deleteBatch.mock.calls.length === 1) {
        store().clearSessionData();
      }
      return { requested: batch.length, deleted: batch.length, errors: [] };
    });

    const { result } = renderHook(() => useDeleteOperations());

    await act(async () => {
      await result.current.deleteFolderWithProgress(folder);
    });

    // An abort is not a failure, so no error toast - and no progress written
    // back, which would resurrect the operation as a nameless card in whichever
    // session came next.
    expect(notifyError).not.toHaveBeenCalled();
    expect(refreshCurrentData).not.toHaveBeenCalled();
    expect(store().deletes).toEqual({});
  });

  it('does not report a single file delete that the session outlived', async () => {
    let releaseDelete!: () => void;
    apiS3.deleteFile.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseDelete = resolve;
      })
    );

    const { result } = renderHook(() => useDeleteOperations());

    let deleting!: Promise<void>;
    act(() => {
      deleting = result.current.deleteFileWithProgress({ name: 'a.pdf', Key: 'a.pdf' } as never);
    });

    await waitFor(() => expect(apiS3.deleteFile).toHaveBeenCalled());

    await act(async () => {
      store().clearSessionData();
      releaseDelete();
      await deleting;
    });

    // The request was already in flight and cannot be recalled, but the UI must
    // not claim success for a session that no longer exists.
    expect(refreshCurrentData).not.toHaveBeenCalled();
    expect(store().deletes).toEqual({});
  });

  it('stops a multi select delete too', async () => {
    apiS3.deleteBatch.mockImplementation(async (batch) => {
      if (apiS3.deleteBatch.mock.calls.length === 1) {
        store().clearSessionData();
      }
      return { requested: batch.length, deleted: batch.length, errors: [] };
    });

    const { result } = renderHook(() => useDeleteOperations());

    await act(async () => {
      await result.current.batchDeleteByKeys(keys(2500));
    });

    expect(apiS3.deleteBatch).toHaveBeenCalledTimes(1);
    expect(store().deletes).toEqual({});
  });
});
