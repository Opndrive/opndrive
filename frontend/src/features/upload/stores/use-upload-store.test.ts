/**
 * Operations store: upload progress, delete operations, batch tracking, and the
 * duplicate prompt.
 *
 * `@opndrive/s3-api` is mocked at the module boundary - it has its own suite and
 * nothing here should depend on real S3 behaviour. The data context is mocked
 * too, because completing an upload asks it to refresh.
 *
 * NOTE: this store also keeps a module-scope `refreshState` object that lives
 * OUTSIDE zustand, so the automatic store reset does not clear it. It debounces
 * refreshes on a 3s window, which would make refresh assertions depend on test
 * order. The suite moves the system clock forward instead of hoping - see the
 * 'refresh on completion' block.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useUploadStore } from './use-upload-store';

const { refreshCurrentData } = vi.hoisted(() => ({
  refreshCurrentData: vi.fn(async () => {}),
}));

vi.mock('@opndrive/s3-api', () => ({
  UploadManager: class {},
  SignedUrlUploadManager: class {},
  BYOS3ApiProvider: class {},
}));

vi.mock('@/context/data-context', () => ({
  useDriveStore: { getState: () => ({ refreshCurrentData }) },
}));

const store = () => useUploadStore.getState();

type Upload = Parameters<ReturnType<typeof store>['addUpload']>[1];
type Delete = Parameters<ReturnType<typeof store>['addDeleteOperation']>[1];

function upload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 'u1',
    name: 'report.pdf',
    status: 'queued',
    progress: 0,
    type: 'file',
    ...overrides,
  } as Upload;
}

function deletion(overrides: Partial<Delete> = {}): Delete {
  return {
    id: 'd1',
    name: 'old.pdf',
    status: 'queued',
    progress: 0,
    type: 'file',
    ...overrides,
  } as Delete;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('upload tracking', () => {
  it('adds an upload under its id', () => {
    store().addUpload('u1', upload());

    expect(store().uploads.u1).toEqual(upload());
  });

  it('keeps existing uploads when adding another', () => {
    store().addUpload('u1', upload());
    store().addUpload('u2', upload({ id: 'u2', name: 'b.pdf' }));

    expect(Object.keys(store().uploads)).toEqual(['u1', 'u2']);
  });

  it('merges partial updates into an existing upload', () => {
    store().addUpload('u1', upload());

    store().updateUpload('u1', { progress: 60, status: 'uploading' });

    expect(store().uploads.u1).toMatchObject({
      name: 'report.pdf',
      progress: 60,
      status: 'uploading',
    });
  });

  it('ignores updates for an upload it is no longer tracking', () => {
    store().updateUpload('never-added', { status: 'cancelled' });

    // Disposing the upload managers on logout emits a trailing 'cancelled' per
    // in-flight item, which can land after clearSessionData(). Spreading onto a
    // missing entry would resurrect it as a card with no name or type.
    expect(store().uploads['never-added']).toBeUndefined();
    expect(Object.keys(store().uploads)).toEqual([]);
  });

  it('removes a single upload', () => {
    store().addUpload('u1', upload());
    store().addUpload('u2', upload({ id: 'u2' }));

    store().removeUpload('u1');

    expect(Object.keys(store().uploads)).toEqual(['u2']);
  });

  it('replaces the whole map with setUploads', () => {
    store().addUpload('u1', upload());

    store().setUploads({ u9: upload({ id: 'u9' }) });

    expect(Object.keys(store().uploads)).toEqual(['u9']);
  });

  it('stores the upload manager it is given', () => {
    const manager = { id: 'mgr' } as never;

    store().setUploadManager(manager);

    expect(store().uploadManager).toBe(manager);
  });
});

describe('clearing', () => {
  beforeEach(() => {
    store().addUpload('done', upload({ id: 'done', status: 'completed' }));
    store().addUpload('gone', upload({ id: 'gone', status: 'cancelled' }));
    store().addUpload('bad', upload({ id: 'bad', status: 'failed' }));
    store().addUpload('live', upload({ id: 'live', status: 'uploading' }));
    store().addUpload('next', upload({ id: 'next', status: 'queued' }));
  });

  it('clears only the finished uploads', () => {
    store().clearCompleted();

    // An in-flight or queued upload must survive - clearing it from the list
    // would not stop it, just hide it.
    expect(Object.keys(store().uploads).sort()).toEqual(['live', 'next']);
  });

  it('clears everything with clearAll', () => {
    store().clearAll();

    expect(store().uploads).toEqual({});
  });

  it('wipes every session-scoped collection on logout', () => {
    store().addDeleteOperation('d1', deletion());
    store().createUploadBatch('file', ['u1']);
    store().showDuplicateDialog({ name: 'x', type: 'file' }, vi.fn(), vi.fn());

    store().clearSessionData();

    // Records from one bucket must not surface in the next session.
    expect(store().uploads).toEqual({});
    expect(store().deletes).toEqual({});
    expect(store().batches).toEqual({});
    expect(store().duplicateDialog).toEqual({
      isOpen: false,
      duplicateItem: null,
      onReplace: null,
      onKeepBoth: null,
    });
  });
});

describe('refresh on completion', () => {
  // `refreshState` lives in module scope, outside zustand, so the automatic
  // store reset does not clear its 3s debounce window. Anchoring each test to a
  // clock that only ever moves forward makes them independent of each other and
  // of how long the previous test happened to take. Setting the time relative
  // to `Date.now()` is NOT enough: afterEach restores real timers, so every
  // test would otherwise start from roughly the same instant and the second one
  // would be silently debounced into asserting nothing.
  let clock = Date.UTC(2026, 0, 1);

  beforeEach(() => {
    vi.useFakeTimers();
    clock += 10 * 60 * 1000;
    vi.setSystemTime(clock);
  });

  it('refreshes when a standalone file finishes', async () => {
    store().addUpload('u1', upload({ status: 'uploading' }));

    store().updateUpload('u1', { status: 'completed' });

    // The refresh is invoked synchronously, before its first await suspends.
    expect(refreshCurrentData).toHaveBeenCalledOnce();
    await Promise.resolve(); // let the in-flight flag clear
  });

  it('refreshes when a folder finishes', async () => {
    store().addUpload('f1', upload({ id: 'f1', type: 'folder', status: 'uploading' }));

    store().updateUpload('f1', { status: 'completed' });

    expect(refreshCurrentData).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it('does not refresh while a folder still has files in flight', () => {
    store().addUpload('folder', upload({ id: 'folder', type: 'folder', fileIds: ['a', 'b'] }));
    store().addUpload('a', upload({ id: 'a', parentFolderId: 'folder' }));
    store().addUpload('b', upload({ id: 'b', parentFolderId: 'folder' }));

    store().updateUpload('a', { status: 'completed' });

    // Refreshing per file would hammer the listing endpoint on a big folder.
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('refreshes once the last file of a folder finishes', async () => {
    store().addUpload('folder', upload({ id: 'folder', type: 'folder', fileIds: ['a', 'b'] }));
    store().addUpload('a', upload({ id: 'a', parentFolderId: 'folder', status: 'completed' }));
    store().addUpload('b', upload({ id: 'b', parentFolderId: 'folder' }));

    store().updateUpload('b', { status: 'completed' });

    expect(refreshCurrentData).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it('does not refresh for a non-completion update', () => {
    store().addUpload('u1', upload());

    store().updateUpload('u1', { progress: 50 });

    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('survives a failing refresh', () => {
    refreshCurrentData.mockRejectedValueOnce(new Error('network down'));
    store().addUpload('u1', upload());

    // A failed background refresh must not surface as a failed upload.
    expect(() => store().updateUpload('u1', { status: 'completed' })).not.toThrow();
    expect(store().uploads.u1.status).toBe('completed');
  });
});

describe('delete operations', () => {
  it('adds an operation', () => {
    store().addDeleteOperation('d1', deletion());

    expect(store().deletes.d1).toEqual(deletion());
  });

  it('updates progress', () => {
    store().addDeleteOperation('d1', deletion());

    store().updateDeleteProgress('d1', 40);

    expect(store().deletes.d1).toMatchObject({ progress: 40, name: 'old.pdf' });
  });

  it('records file counts when given', () => {
    store().addDeleteOperation('d1', deletion());

    store().updateDeleteProgress('d1', 50, 5, 10);

    expect(store().deletes.d1).toMatchObject({ completedFiles: 5, totalFiles: 10 });
  });

  it('leaves file counts alone when omitted', () => {
    store().addDeleteOperation('d1', deletion({ completedFiles: 3, totalFiles: 9 }));

    store().updateDeleteProgress('d1', 60);

    // Spreading `undefined` in would wipe a count the UI is already showing.
    expect(store().deletes.d1).toMatchObject({ completedFiles: 3, totalFiles: 9 });
  });

  it('flags size calculation', () => {
    store().addDeleteOperation('d1', deletion());

    store().setCalculatingSize('d1', true);
    expect(store().deletes.d1.isCalculatingSize).toBe(true);

    store().setCalculatingSize('d1', false);
    expect(store().deletes.d1.isCalculatingSize).toBe(false);
  });

  it('records a measured size', () => {
    store().addDeleteOperation('d1', deletion());

    store().updateSize('d1', 2048, 7);

    expect(store().deletes.d1).toMatchObject({ size: 2048, totalFiles: 7 });
  });

  it('completes at 100 percent', () => {
    store().addDeleteOperation('d1', deletion({ progress: 30 }));

    store().completeDeleteOperation('d1');

    expect(store().deletes.d1).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('records the reason a delete failed', () => {
    store().addDeleteOperation('d1', deletion());

    store().failDeleteOperation('d1', 'AccessDenied');

    expect(store().deletes.d1).toMatchObject({ status: 'failed', error: 'AccessDenied' });
  });

  it('aborts the in-flight request when cancelled', () => {
    const abortController = new AbortController();
    store().addDeleteOperation('d1', deletion({ status: 'deleting', abortController }));

    store().cancelDeleteOperation('d1');

    // Marking it cancelled without aborting would leave the request running and
    // the objects deleted anyway.
    expect(abortController.signal.aborted).toBe(true);
    expect(store().deletes.d1.status).toBe('cancelled');
  });

  it('cancels an operation that has no abort controller', () => {
    store().addDeleteOperation('d1', deletion());

    expect(() => store().cancelDeleteOperation('d1')).not.toThrow();
    expect(store().deletes.d1.status).toBe('cancelled');
  });

  it.each(['queued', 'deleting'] as const)('reports %s as active', (status) => {
    store().addDeleteOperation('d1', deletion({ status }));

    expect(store().isDeleteOperationActive('d1')).toBe(true);
  });

  it.each(['completed', 'failed', 'cancelled'] as const)('reports %s as inactive', (status) => {
    store().addDeleteOperation('d1', deletion({ status }));

    expect(store().isDeleteOperationActive('d1')).toBe(false);
  });

  it('reports an unknown operation as inactive', () => {
    expect(store().isDeleteOperationActive('nope')).toBeFalsy();
  });

  it('exposes the abort controller', () => {
    const abortController = new AbortController();
    store().addDeleteOperation('d1', deletion({ abortController }));

    expect(store().getDeleteAbortController('d1')).toBe(abortController);
    expect(store().getDeleteAbortController('nope')).toBeUndefined();
  });

  it('removes an operation', () => {
    store().addDeleteOperation('d1', deletion());
    store().addDeleteOperation('d2', deletion({ id: 'd2' }));

    store().removeDeleteOperation('d1');

    expect(Object.keys(store().deletes)).toEqual(['d2']);
  });
});

describe('batch tracking', () => {
  it('creates a batch sized to its uploads', () => {
    const batchId = store().createUploadBatch('file', ['a', 'b', 'c']);

    expect(store().getBatch(batchId)).toMatchObject({
      type: 'file',
      uploadIds: ['a', 'b', 'c'],
      totalCount: 3,
      completedCount: 0,
      isComplete: false,
      hasTriggeredRefresh: false,
    });
  });

  it('copies the id list instead of holding the caller array', () => {
    const ids = ['a', 'b'];
    const batchId = store().createUploadBatch('file', ids);

    ids.push('c');

    // Holding the caller's array would let a later mutation silently change
    // totalCount's meaning after the fact.
    expect(store().getBatch(batchId)!.uploadIds).toEqual(['a', 'b']);
  });

  it('gives each batch a distinct id', () => {
    const a = store().createUploadBatch('file', ['x']);
    const b = store().createUploadBatch('file', ['y']);

    expect(a).not.toBe(b);
    expect(Object.keys(store().batches)).toHaveLength(2);
  });

  it('counts completions', () => {
    const batchId = store().createUploadBatch('file', ['a', 'b']);

    store().updateBatchProgress(batchId, 'a', true);

    expect(store().getBatch(batchId)).toMatchObject({ completedCount: 1, isComplete: false });
  });

  it('marks the batch complete on the last upload', () => {
    const batchId = store().createUploadBatch('file', ['a', 'b']);

    store().updateBatchProgress(batchId, 'a', true);
    store().updateBatchProgress(batchId, 'b', true);

    expect(store().isBatchComplete(batchId)).toBe(true);
  });

  it('does not count an upload that did not complete', () => {
    const batchId = store().createUploadBatch('file', ['a', 'b']);

    store().updateBatchProgress(batchId, 'a', false);

    expect(store().getBatch(batchId)!.completedCount).toBe(0);
  });

  it('ignores progress for an unknown batch', () => {
    expect(() => store().updateBatchProgress('nope', 'a', true)).not.toThrow();
    expect(store().batches).toEqual({});
  });

  it('reports an unknown batch as incomplete', () => {
    expect(store().isBatchComplete('nope')).toBe(false);
    expect(store().getBatch('nope')).toBeUndefined();
  });

  it('keeps recent and in-flight batches during cleanup', () => {
    const active = store().createUploadBatch('file', ['a', 'b']);
    const justFinished = store().createUploadBatch('file', ['c']);
    store().updateBatchProgress(justFinished, 'c', true);

    store().cleanupCompletedBatches();

    expect(Object.keys(store().batches).sort()).toEqual([active, justFinished].sort());
  });

  it('drops completed batches older than five minutes', () => {
    vi.useFakeTimers();
    const stale = store().createUploadBatch('file', ['a']);
    store().updateBatchProgress(stale, 'a', true);
    const active = store().createUploadBatch('file', ['b', 'c']);

    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    store().cleanupCompletedBatches();

    // Unfinished batches are kept regardless of age - dropping one would lose
    // the completion tracking for uploads still running.
    expect(Object.keys(store().batches)).toEqual([active]);
  });
});

describe('duplicate dialog', () => {
  it('opens with the item and both choices', () => {
    const onReplace = vi.fn();
    const onKeepBoth = vi.fn();

    store().showDuplicateDialog({ name: 'a.pdf', type: 'file', size: 10 }, onReplace, onKeepBoth);

    expect(store().duplicateDialog).toEqual({
      isOpen: true,
      duplicateItem: { name: 'a.pdf', type: 'file', size: 10 },
      onReplace,
      onKeepBoth,
    });
  });

  it('KNOWN GAP: a second prompt replaces the first instead of queueing', () => {
    const firstReplace = vi.fn();
    const secondReplace = vi.fn();

    store().showDuplicateDialog({ name: 'a.txt', type: 'file' }, firstReplace, vi.fn());
    store().showDuplicateDialog({ name: 'b.txt', type: 'file' }, secondReplace, vi.fn());

    // The dialog is a single slot, not a queue. Two duplicates resolved
    // concurrently would lose the first prompt: its callbacks are dropped, so
    // whatever it was waiting on never resolves.
    //
    // Not reachable from a single drop today - the folder loop returns on the
    // first duplicate it finds - but two overlapping drops can do it. Pinned so
    // a future queue implementation has to change this deliberately.
    expect(store().duplicateDialog.duplicateItem).toEqual({ name: 'b.txt', type: 'file' });
    expect(store().duplicateDialog.onReplace).toBe(secondReplace);
    expect(firstReplace).not.toHaveBeenCalled();
  });

  it('clears the callbacks when hidden', () => {
    store().showDuplicateDialog({ name: 'a.pdf', type: 'file' }, vi.fn(), vi.fn());

    store().hideDuplicateDialog();

    // Leaving the callbacks behind would let a later dialog fire the previous
    // prompt's decision.
    expect(store().duplicateDialog).toEqual({
      isOpen: false,
      duplicateItem: null,
      onReplace: null,
      onKeepBoth: null,
    });
  });
});
