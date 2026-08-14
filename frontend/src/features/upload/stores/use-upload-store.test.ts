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
type Delete = Parameters<ReturnType<typeof store>['startDeleteOperation']>[1];

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
    store().startDeleteOperation('d1', deletion());
    store().showDuplicateDialog({ name: 'x', type: 'file' }, vi.fn(), vi.fn());

    store().clearSessionData();

    // Records from one bucket must not surface in the next session.
    expect(store().uploads).toEqual({});
    expect(store().deletes).toEqual({});
    expect(store().duplicateQueue).toEqual([]);
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
  it('adds an operation with a controller of its own', () => {
    store().startDeleteOperation('d1', deletion());

    expect(store().deletes.d1).toMatchObject(deletion());
    expect(store().deletes.d1.abortController).toBeInstanceOf(AbortController);
  });

  it('gives each operation its own controller', () => {
    const first = store().startDeleteOperation('d1', deletion());
    const second = store().startDeleteOperation('d2', deletion({ id: 'd2' }));

    // Sharing one would make cancelling a single delete stop all of them.
    expect(first).not.toBe(second);

    store().cancelDeleteOperation('d1');

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('updates progress', () => {
    store().startDeleteOperation('d1', deletion());

    store().updateDeleteProgress('d1', 40);

    expect(store().deletes.d1).toMatchObject({ progress: 40, name: 'old.pdf' });
  });

  it('records file counts when given', () => {
    store().startDeleteOperation('d1', deletion());

    store().updateDeleteProgress('d1', 50, 5, 10);

    expect(store().deletes.d1).toMatchObject({ completedFiles: 5, totalFiles: 10 });
  });

  it('leaves file counts alone when omitted', () => {
    store().startDeleteOperation('d1', deletion({ completedFiles: 3, totalFiles: 9 }));

    store().updateDeleteProgress('d1', 60);

    // Spreading `undefined` in would wipe a count the UI is already showing.
    expect(store().deletes.d1).toMatchObject({ completedFiles: 3, totalFiles: 9 });
  });

  it('flags size calculation', () => {
    store().startDeleteOperation('d1', deletion());

    store().setCalculatingSize('d1', true);
    expect(store().deletes.d1.isCalculatingSize).toBe(true);

    store().setCalculatingSize('d1', false);
    expect(store().deletes.d1.isCalculatingSize).toBe(false);
  });

  it('records a measured size', () => {
    store().startDeleteOperation('d1', deletion());

    store().updateSize('d1', 2048, 7);

    expect(store().deletes.d1).toMatchObject({ size: 2048, totalFiles: 7 });
  });

  it('completes at 100 percent', () => {
    store().startDeleteOperation('d1', deletion({ progress: 30 }));

    store().completeDeleteOperation('d1');

    expect(store().deletes.d1).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('records the reason a delete failed', () => {
    store().startDeleteOperation('d1', deletion());

    store().failDeleteOperation('d1', 'AccessDenied');

    expect(store().deletes.d1).toMatchObject({ status: 'failed', error: 'AccessDenied' });
  });

  it('aborts the in-flight request when cancelled', () => {
    const signal = store().startDeleteOperation('d1', deletion({ status: 'deleting' }));

    store().cancelDeleteOperation('d1');

    // Marking it cancelled without aborting would leave the request running and
    // the objects deleted anyway.
    expect(signal.aborted).toBe(true);
    expect(store().deletes.d1.status).toBe('cancelled');
  });

  it('ignores a cancel for an operation it is not tracking', () => {
    expect(() => store().cancelDeleteOperation('nope')).not.toThrow();
    expect(store().deletes.nope).toBeUndefined();
  });

  it.each(['queued', 'deleting'] as const)('reports %s as active', (status) => {
    store().startDeleteOperation('d1', deletion({ status }));

    expect(store().isDeleteOperationActive('d1')).toBe(true);
  });

  it.each(['completed', 'failed', 'cancelled'] as const)('reports %s as inactive', (status) => {
    store().startDeleteOperation('d1', deletion({ status }));

    expect(store().isDeleteOperationActive('d1')).toBe(false);
  });

  it('reports an unknown operation as inactive', () => {
    expect(store().isDeleteOperationActive('nope')).toBeFalsy();
  });

  it('exposes the abort controller it built', () => {
    const signal = store().startDeleteOperation('d1', deletion());

    // The store owns the controller, so the signal handed back to the caller
    // and the one held in the map have to be the same object - otherwise the
    // delete loop watches a signal nothing can ever abort.
    expect(store().getDeleteAbortController('d1')?.signal).toBe(signal);
    expect(store().getDeleteAbortController('nope')).toBeUndefined();
  });

  it('removes an operation', () => {
    store().startDeleteOperation('d1', deletion());
    store().startDeleteOperation('d2', deletion({ id: 'd2' }));

    store().removeDeleteOperation('d1');

    expect(Object.keys(store().deletes)).toEqual(['d2']);
  });

  it('aborts a running operation it removes', () => {
    const signal = store().startDeleteOperation('d1', deletion({ status: 'deleting' }));

    store().removeDeleteOperation('d1');

    // The operations modal cancels a delete by removing it. Dropping the entry
    // without aborting takes the card off screen while the loop keeps deleting,
    // which is the worst of both: the user is told it stopped, and it did not.
    expect(signal.aborted).toBe(true);
  });

  it('removes a finished operation without touching anything', () => {
    const signal = store().startDeleteOperation('d1', deletion({ status: 'completed' }));

    store().removeDeleteOperation('d1');

    // Dismissing a finished card is not a cancellation.
    expect(signal.aborted).toBe(false);
    expect(store().deletes.d1).toBeUndefined();
  });

  it('ignores a remove for an operation it is not tracking', () => {
    expect(() => store().removeDeleteOperation('nope')).not.toThrow();
    expect(store().deletes).toEqual({});
  });
});

/**
 * A delete loop holds the S3 client it started with in a closure, so nulling
 * the provider on logout does not reach it. Aborting is the only thing that
 * does, which makes these the tests that stop a destructive operation from
 * outliving the session that authorised it.
 */
describe('ending a session stops running deletes', () => {
  it('aborts every operation still in flight', () => {
    const queued = store().startDeleteOperation('d1', deletion({ status: 'queued' }));
    const running = store().startDeleteOperation('d2', deletion({ id: 'd2', status: 'deleting' }));

    store().abortAllDeleteOperations();

    expect(queued.aborted).toBe(true);
    expect(running.aborted).toBe(true);
    expect(store().deletes.d1.status).toBe('cancelled');
    expect(store().deletes.d2.status).toBe('cancelled');
  });

  it('leaves an operation that already finished alone', () => {
    store().startDeleteOperation('done', deletion({ id: 'done', status: 'completed' }));
    store().startDeleteOperation('bad', deletion({ id: 'bad', status: 'failed' }));

    store().abortAllDeleteOperations();

    // Rewriting these to 'cancelled' would misreport history: the delete did
    // happen, and the failure is what the user needs to see.
    expect(store().deletes.done.status).toBe('completed');
    expect(store().deletes.bad.status).toBe('failed');
  });

  it('does nothing when no delete is running', () => {
    expect(() => store().abortAllDeleteOperations()).not.toThrow();
    expect(store().deletes).toEqual({});
  });

  it('aborts before wiping the map on logout', () => {
    const signal = store().startDeleteOperation('d1', deletion({ status: 'deleting' }));

    store().clearSessionData();

    // Order is the whole point. `deletes` holds the only reference to the
    // controller, so wiping it first would leave the loop running with nothing
    // left that could ever stop it.
    expect(signal.aborted).toBe(true);
    expect(store().deletes).toEqual({});
  });

  it('ignores progress reported after the operation was wiped', () => {
    store().startDeleteOperation('d1', deletion({ status: 'deleting' }));
    store().clearSessionData();

    // The loop keeps going until its in-flight batch resolves, and then writes
    // progress for an operation that no longer exists. Spreading onto a missing
    // entry would resurrect it as a nameless card in the next session.
    store().updateDeleteProgress('d1', 60, 6, 10);
    store().completeDeleteOperation('d1');

    expect(store().deletes.d1).toBeUndefined();
    expect(store().deletes).toEqual({});
  });

  it.each([
    ['updateDeleteProgress', () => store().updateDeleteProgress('gone', 50)],
    ['setCalculatingSize', () => store().setCalculatingSize('gone', true)],
    ['updateSize', () => store().updateSize('gone', 1024, 3)],
    ['completeDeleteOperation', () => store().completeDeleteOperation('gone')],
    ['failDeleteOperation', () => store().failDeleteOperation('gone', 'boom')],
  ])('%s cannot recreate an operation that is gone', (_name, write) => {
    write();

    expect(store().deletes.gone).toBeUndefined();
    expect(Object.keys(store().deletes)).toEqual([]);
  });
});

describe('duplicate prompt queue', () => {
  /** Mirrors what DuplicateDialog does: choose, then close. */
  function answer(choice: 'replace' | 'keepBoth') {
    store().resolveDuplicate(choice);
    store().hideDuplicateDialog();
  }

  it('queues a prompt with its item and both choices', () => {
    const onReplace = vi.fn();
    const onKeepBoth = vi.fn();

    store().showDuplicateDialog({ name: 'a.pdf', type: 'file', size: 10 }, onReplace, onKeepBoth);

    expect(store().duplicateQueue).toHaveLength(1);
    expect(store().duplicateQueue[0]).toMatchObject({
      duplicateItem: { name: 'a.pdf', type: 'file', size: 10 },
      onReplace,
      onKeepBoth,
    });
  });

  it('gives each prompt its own id', () => {
    store().showDuplicateDialog({ name: 'a.txt', type: 'file' }, vi.fn(), vi.fn());
    store().showDuplicateDialog({ name: 'b.txt', type: 'file' }, vi.fn(), vi.fn());

    const [first, second] = store().duplicateQueue;
    expect(first!.id).not.toBe(second!.id);
  });

  it('keeps both prompts when two drops collide, oldest first', () => {
    store().showDuplicateDialog({ name: 'a.txt', type: 'file' }, vi.fn(), vi.fn());
    store().showDuplicateDialog({ name: 'b.txt', type: 'file' }, vi.fn(), vi.fn());

    // A single slot used to drop the first prompt's callbacks here, so the
    // upload waiting on that answer hung forever.
    expect(store().duplicateQueue.map((p) => p.duplicateItem.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('resolves two concurrent drops in order, each with its own choice', async () => {
    const outcomes: string[] = [];

    // Exactly the shape the store uses internally: an upload parked on a
    // promise until the user answers.
    const dropA = new Promise<string>((resolve) => {
      store().showDuplicateDialog(
        { name: 'a.txt', type: 'file' },
        () => resolve('a:replace'),
        () => resolve('a:keepBoth')
      );
    });
    const dropB = new Promise<string>((resolve) => {
      store().showDuplicateDialog(
        { name: 'b.txt', type: 'file' },
        () => resolve('b:replace'),
        () => resolve('b:keepBoth')
      );
    });

    expect(store().duplicateQueue).toHaveLength(2);

    answer('replace');
    expect(store().duplicateQueue).toHaveLength(1);
    // The next question is now the head, not a lost prompt.
    expect(store().duplicateQueue[0]!.duplicateItem.name).toBe('b.txt');

    answer('keepBoth');
    expect(store().duplicateQueue).toHaveLength(0);

    outcomes.push(await dropA, await dropB);
    // Both uploads resumed, each with the answer the user gave it.
    expect(outcomes).toEqual(['a:replace', 'b:keepBoth']);
  });

  it('runs only the head prompt callback', () => {
    const firstReplace = vi.fn();
    const secondReplace = vi.fn();
    store().showDuplicateDialog({ name: 'a.txt', type: 'file' }, firstReplace, vi.fn());
    store().showDuplicateDialog({ name: 'b.txt', type: 'file' }, secondReplace, vi.fn());

    store().resolveDuplicate('replace');

    expect(firstReplace).toHaveBeenCalledOnce();
    expect(secondReplace).not.toHaveBeenCalled();
  });

  it('does not dequeue on resolve alone', () => {
    store().showDuplicateDialog({ name: 'a.txt', type: 'file' }, vi.fn(), vi.fn());

    store().resolveDuplicate('replace');

    // The dialog component calls the choice handler and THEN onClose, so
    // dequeuing here as well would silently skip the prompt behind this one.
    expect(store().duplicateQueue).toHaveLength(1);
  });

  it('dismisses without answering when closed outright', () => {
    const onReplace = vi.fn();
    const onKeepBoth = vi.fn();
    store().showDuplicateDialog({ name: 'a.txt', type: 'file' }, onReplace, onKeepBoth);

    store().hideDuplicateDialog();

    expect(store().duplicateQueue).toHaveLength(0);
    expect(onReplace).not.toHaveBeenCalled();
    expect(onKeepBoth).not.toHaveBeenCalled();
  });

  it('ignores a resolve when nothing is queued', () => {
    expect(() => store().resolveDuplicate('replace')).not.toThrow();
    expect(store().duplicateQueue).toEqual([]);
  });

  it('ignores a dismiss when nothing is queued', () => {
    expect(() => store().hideDuplicateDialog()).not.toThrow();
    expect(store().duplicateQueue).toEqual([]);
  });
});
