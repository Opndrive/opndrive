/**
 * Upload executor.
 *
 * The layer where planning meets the network, so the tests concentrate on the
 * three places it can silently corrupt a user's bucket:
 *
 *  - KEYS. Extraction stamps files with a path that starts with the dropped
 *    folder's name, and the plan's prefix already ends with that folder's
 *    RESOLVED name. Getting this wrong nests everything one level too deep and
 *    quietly undoes Phase 4's collision rename, so several tests here assert
 *    the exact key string rather than a shape.
 *  - CLAIM TIMING. Committing before bytes land locks a prefix for the session
 *    with nothing stored under it; committing too late lets a second drop
 *    overwrite real data. Both directions are tested.
 *  - CANCELLATION. A cancelled folder must cancel every one of its files, and
 *    must only hand the name back if nothing was ever written.
 *
 * The manager is a fake rather than a mock of the real class: the executor
 * talks to it through four methods, and driving events by hand is what makes
 * the claim timing testable at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createUploadExecutor,
  keyForPlannedFile,
  type ManagerEvent,
  type UploadExecutor,
  type UploadManagerLike,
} from './upload-executor';
import { useUploadQueueStore, type PlannedUpload } from '../stores/use-upload-queue-store';

const queue = () => useUploadQueueStore.getState();

/**
 * A stand-in UploadManager that records what it was asked to upload and lets a
 * test emit events on demand.
 */
function fakeManager() {
  const listeners: Record<string, ((p: ManagerEvent) => void)[]> = {
    progress: [],
    statusChange: [],
  };
  const added: { id: string; key: string; file: File }[] = [];
  const cancelled: string[] = [];
  let nextId = 0;

  const manager: UploadManagerLike & {
    added: typeof added;
    cancelled: typeof cancelled;
    emit(event: 'progress' | 'statusChange', payload: ManagerEvent): void;
    listenerCount(): number;
    failCancel: Set<string>;
  } = {
    added,
    cancelled,
    failCancel: new Set<string>(),
    addUpload(file, config) {
      const id = `upload-${nextId++}`;
      added.push({ id, key: config.key, file });
      return id;
    },
    async cancelUpload(id) {
      cancelled.push(id);
      if (manager.failCancel.has(id)) throw new Error(`abort failed for ${id}`);
    },
    on(event, listener) {
      listeners[event]!.push(listener);
    },
    off(event, listener) {
      listeners[event] = listeners[event]!.filter((l) => l !== listener);
    },
    emit(event, payload) {
      for (const listener of [...listeners[event]!]) listener(payload);
    },
    listenerCount: () => listeners.progress!.length + listeners.statusChange!.length,
  };

  return manager;
}

function makeFile(name: string, relativePath?: string, size = 10): File {
  const file = new File([new Uint8Array(size)], name);
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  }
  return file;
}

function folderPlan(overrides: Partial<PlannedUpload> = {}): PlannedUpload {
  return {
    id: 'task-folder',
    kind: 'folder',
    originalName: 'photos',
    resolvedName: 'photos',
    prefix: 'photos/',
    verification: 'confirmed',
    files: [makeFile('a.jpg', 'photos/a.jpg')],
    totalBytes: 10,
    ...overrides,
  };
}

function filePlan(overrides: Partial<PlannedUpload> = {}): PlannedUpload {
  return {
    id: 'task-files',
    kind: 'file',
    originalName: '',
    resolvedName: '',
    prefix: '',
    verification: 'unchecked',
    files: [makeFile('loose.txt')],
    totalBytes: 10,
    ...overrides,
  };
}

let manager: ReturnType<typeof fakeManager>;
let executor: UploadExecutor;

beforeEach(() => {
  manager = fakeManager();
  executor = createUploadExecutor(manager);
});

describe('keyForPlannedFile', () => {
  it('strips the dropped folder name that the prefix already carries', () => {
    // The blocker this layer exists to avoid. Extraction produces
    // "photos/a.jpg" and the plan resolved to "docs/photos (1)/", so naive
    // concatenation yields "docs/photos (1)/photos/a.jpg" - nested twice and
    // with the rename undone one level down.
    const plan = folderPlan({ resolvedName: 'photos (1)', prefix: 'docs/photos (1)/' });

    const key = keyForPlannedFile(plan, makeFile('a.jpg', 'photos/a.jpg'));

    expect(key).toBe('docs/photos (1)/a.jpg');
  });

  it('keeps nesting below the dropped folder intact', () => {
    const plan = folderPlan({ prefix: 'docs/photos/' });

    const key = keyForPlannedFile(plan, makeFile('a.jpg', 'photos/holiday/raw/a.jpg'));

    expect(key).toBe('docs/photos/holiday/raw/a.jpg');
  });

  it('places a file sitting directly in the dropped folder at the prefix root', () => {
    const plan = folderPlan({ prefix: 'photos/' });

    expect(keyForPlannedFile(plan, makeFile('a.jpg', 'photos/a.jpg'))).toBe('photos/a.jpg');
  });

  it('falls back to the file name when no relative path was stamped', () => {
    // Belt and braces: extraction always sets webkitRelativePath, but a file
    // arriving from anywhere else must not produce an "undefined" key.
    const plan = folderPlan({ prefix: 'photos/' });

    expect(keyForPlannedFile(plan, makeFile('orphan.jpg'))).toBe('photos/orphan.jpg');
  });

  it('uses the bare name for loose files', () => {
    // A loose file was never nested, so nothing may be stripped from it.
    expect(keyForPlannedFile(filePlan({ prefix: 'docs/' }), makeFile('loose.txt'))).toBe(
      'docs/loose.txt'
    );
  });

  it('keeps a loose file whole even if it carries a relative path', () => {
    const plan = filePlan({ prefix: 'docs/' });

    expect(keyForPlannedFile(plan, makeFile('a.txt', 'somewhere/a.txt'))).toBe('docs/a.txt');
  });

  it('handles a root destination', () => {
    expect(keyForPlannedFile(folderPlan({ prefix: 'photos/' }), makeFile('a', 'photos/a'))).toBe(
      'photos/a'
    );
  });

  it('strips the root even when the path has a leading slash', () => {
    // The nastiest variant of the double-nesting bug: a leading slash makes the
    // first segment empty, so a naive strip removes nothing and the original
    // folder name survives into the key looking perfectly reasonable.
    const plan = folderPlan({ prefix: 'docs/photos (1)/' });

    expect(keyForPlannedFile(plan, makeFile('a.jpg', '/photos/a.jpg'))).toBe(
      'docs/photos (1)/a.jpg'
    );
  });

  it('collapses repeated slashes rather than creating an empty segment', () => {
    // S3 treats "//" as a real, empty path component, producing an object most
    // tools cannot address.
    const plan = folderPlan({ prefix: 'docs/photos/' });

    expect(keyForPlannedFile(plan, makeFile('a.jpg', 'photos//a.jpg'))).toBe('docs/photos/a.jpg');
    expect(keyForPlannedFile(plan, makeFile('b.jpg', 'photos//sub//b.jpg'))).toBe(
      'docs/photos/sub/b.jpg'
    );
  });

  it('falls back to the file name when stripping leaves nothing', () => {
    // Otherwise the key would equal the prefix exactly, creating a zero-byte
    // object shadowing the folder it lives in.
    const plan = folderPlan({ prefix: 'docs/photos/' });

    expect(keyForPlannedFile(plan, makeFile('a.jpg', 'photos/'))).toBe('docs/photos/a.jpg');
    expect(keyForPlannedFile(plan, makeFile('a.jpg', '/'))).toBe('docs/photos/a.jpg');
  });

  it('leaves backslashes alone', () => {
    // Legal in a POSIX filename, so rewriting them would corrupt real names
    // rather than fix paths.
    const plan = folderPlan({ prefix: 'docs/photos/' });

    expect(keyForPlannedFile(plan, makeFile('odd', 'photos/we\\ird.jpg'))).toBe(
      'docs/photos/we\\ird.jpg'
    );
  });

  it('preserves spaces and parentheses from a resolved name', () => {
    // The resolved name is the one place suffixes appear, so it must survive
    // untouched into the key.
    const plan = folderPlan({ prefix: 'trips/my photos (2)/' });

    expect(keyForPlannedFile(plan, makeFile('a.jpg', 'my photos/a.jpg'))).toBe(
      'trips/my photos (2)/a.jpg'
    );
  });
});

describe('start', () => {
  it('dispatches one upload per file with the mapped key', () => {
    const plan = folderPlan({
      prefix: 'docs/photos (1)/',
      files: [makeFile('a.jpg', 'photos/a.jpg'), makeFile('b.jpg', 'photos/raw/b.jpg')],
    });

    executor.start([plan]);

    expect(manager.added.map((a) => a.key)).toEqual([
      'docs/photos (1)/a.jpg',
      'docs/photos (1)/raw/b.jpg',
    ]);
  });

  it('reports the manager ids it produced for each task', () => {
    const results = executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('task-folder');
    expect(results[0]!.files[0]!.uploadId).toBe('upload-0');
    expect(executor.uploadsFor('task-folder')).toEqual(['upload-0']);
  });

  it('routes every dispatched upload back to its task', () => {
    executor.start([
      folderPlan({ id: 'task-a', files: [makeFile('a', 'photos/a')] }),
      folderPlan({ id: 'task-b', files: [makeFile('b', 'videos/b')] }),
    ]);

    expect(executor.taskFor('upload-0')).toBe('task-a');
    expect(executor.taskFor('upload-1')).toBe('task-b');
    expect(executor.taskFor('upload-nope')).toBeUndefined();
  });

  it('dispatches several plans in one call', () => {
    executor.start([
      folderPlan({ id: 'task-a', prefix: 'a/', files: [makeFile('x', 'a/x')] }),
      filePlan({ id: 'task-b', prefix: '', files: [makeFile('loose.txt')] }),
    ]);

    expect(manager.added.map((a) => a.key)).toEqual(['a/x', 'loose.txt']);
  });

  it('does not queue anything for an empty plan', () => {
    executor.start([folderPlan({ files: [] })]);

    expect(manager.added).toEqual([]);
  });

  it('refuses to dispatch the same task twice', () => {
    // Overwriting the record would orphan the first attempt's uploads: they
    // still route to this task id, so their terminal events would settle the
    // NEW record early and free a prefix the second attempt is uploading into.
    const plan = folderPlan({ files: [makeFile('a', 'photos/a')] });
    executor.start([plan]);

    const second = executor.start([plan]);

    expect(second[0]!.dispatchError).toBeInstanceOf(Error);
    expect(second[0]!.files).toEqual([]);
    expect(manager.added).toHaveLength(1);
    // The original dispatch is still intact and still cancellable.
    expect(executor.uploadsFor('task-folder')).toEqual(['upload-0']);
  });

  it('reports a dispatch failure instead of throwing', () => {
    // addUpload throws on a disposed manager, which is what logging out or
    // switching bucket mid-drop does.
    const failing = fakeManager();
    failing.addUpload = () => {
      throw new Error('This UploadManager instance has been disposed.');
    };
    const failingExecutor = createUploadExecutor(failing);

    const results = failingExecutor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    expect(results[0]!.dispatchError?.message).toContain('disposed');
    expect(results[0]!.files).toEqual([]);
    failingExecutor.dispose();
  });

  it('wraps a non-Error throw so callers always get an Error', () => {
    const rude = fakeManager();
    rude.addUpload = () => {
      throw 'nope';
    };
    const rudeExecutor = createUploadExecutor(rude);

    const results = rudeExecutor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    expect(results[0]!.dispatchError).toBeInstanceOf(Error);
    expect(results[0]!.dispatchError!.message).toBe('nope');
    rudeExecutor.dispose();
  });

  it('keeps dispatching later plans after one is refused', () => {
    // Same philosophy as planning: one folder in trouble must not abandon the
    // rest of the drop.
    let calls = 0;
    const flaky = fakeManager();
    const plainAdd = flaky.addUpload.bind(flaky);
    flaky.addUpload = (file, config) => {
      if (calls++ === 0) throw new Error('refused');
      return plainAdd(file, config);
    };
    const flakyExecutor = createUploadExecutor(flaky);

    const results = flakyExecutor.start([
      folderPlan({ id: 'task-a', prefix: 'a/', files: [makeFile('x', 'a/x')] }),
      folderPlan({ id: 'task-b', prefix: 'b/', files: [makeFile('y', 'b/y')] }),
    ]);

    expect(results[0]!.dispatchError).toBeInstanceOf(Error);
    expect(results[1]!.dispatchError).toBeUndefined();
    expect(results[1]!.files).toHaveLength(1);
    flakyExecutor.dispose();
  });

  it('frees the prefix of a plan the manager refused outright', () => {
    // Nothing was queued, so nothing will ever emit an event to settle it.
    queue().reservePrefix('photos', '', 'task-folder');
    const failing = fakeManager();
    failing.addUpload = () => {
      throw new Error('disposed');
    };
    const failingExecutor = createUploadExecutor(failing);

    failingExecutor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    expect(queue().claimedPrefixes()).toEqual([]);
    failingExecutor.dispose();
  });

  it('settles a half-dispatched plan on the files that did get through', () => {
    // `pending` must be corrected to what the manager actually accepted. Left
    // at the planned total it could never reach zero, and the prefix would be
    // squatted for the rest of the session.
    queue().reservePrefix('photos', '', 'task-folder');
    let calls = 0;
    const flaky = fakeManager();
    const plainAdd = flaky.addUpload.bind(flaky);
    flaky.addUpload = (file, config) => {
      if (calls++ === 1) throw new Error('disposed mid-folder');
      return plainAdd(file, config);
    };
    const flakyExecutor = createUploadExecutor(flaky);

    flakyExecutor.start([
      folderPlan({
        files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b'), makeFile('c', 'photos/c')],
      }),
    ]);

    // One file made it through, so the claim is still held.
    expect(queue().claimedPrefixes()).toEqual(['photos/']);

    flaky.emit('statusChange', { id: 'upload-0', status: 'failed', progress: 0 });

    expect(queue().claimedPrefixes()).toEqual([]);
    flakyExecutor.dispose();
  });

  it('releases the claim of a plan that has no files', () => {
    // Nothing will ever be uploaded, so no event will ever arrive to settle
    // it. Without this the prefix would stay reserved for the whole session.
    queue().reservePrefix('photos', '', 'task-folder');

    executor.start([folderPlan({ files: [] })]);

    expect(queue().claimedPrefixes()).toEqual([]);
  });
});

describe('claim lifecycle', () => {
  function startOne() {
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);
  }

  it('does not commit merely because an upload started', () => {
    // CreateMultipartUpload writes no visible object. Committing here would
    // lock the prefix for a task that may fail a moment later.
    startOne();

    manager.emit('statusChange', { id: 'upload-0', status: 'uploading', progress: 0 });
    manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: 0 });

    expect(queue().claims[0]!.committed).toBe(false);
  });

  it('commits as soon as bytes land', () => {
    startOne();

    manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: 12 });

    expect(queue().claims[0]!.committed).toBe(true);
  });

  it('commits on completion even without a progress event', () => {
    // A file small enough to finish in one part may never emit progress.
    startOne();

    manager.emit('statusChange', { id: 'upload-0', status: 'completed', progress: 100 });

    expect(queue().claims[0]!.committed).toBe(true);
  });

  it('commits only once across many progress events', () => {
    startOne();
    const spy = vi.spyOn(useUploadQueueStore.getState(), 'commitClaim');

    for (let i = 1; i <= 5; i++) {
      manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: i * 10 });
    }

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('commits the whole folder when any one of its files moves', () => {
    // The claim covers the folder prefix, so one file writing into it is
    // enough to make the name unsafe to hand back.
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b')] })]);

    manager.emit('progress', { id: 'upload-1', status: 'uploading', progress: 5 });

    expect(queue().claims[0]!.committed).toBe(true);
  });

  it('releases the claim when every file failed without writing', () => {
    // Nothing reached the bucket, so the name is genuinely free again.
    startOne();

    manager.emit('statusChange', { id: 'upload-0', status: 'failed', progress: 0 });

    expect(queue().claimedPrefixes()).toEqual([]);
  });

  it('keeps the claim when a file failed after writing part of itself', () => {
    // Parts already landed under this prefix. Releasing would let the next
    // drop of the same folder pick it and overwrite them.
    startOne();

    manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: 40 });
    manager.emit('statusChange', { id: 'upload-0', status: 'failed', progress: 40 });

    expect(queue().claimedPrefixes()).toEqual(['photos/']);
  });

  it('waits for every file before releasing', () => {
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b')] })]);

    manager.emit('statusChange', { id: 'upload-0', status: 'failed', progress: 0 });
    expect(queue().claimedPrefixes()).toEqual(['photos/']);

    manager.emit('statusChange', { id: 'upload-1', status: 'failed', progress: 0 });
    expect(queue().claimedPrefixes()).toEqual([]);
  });

  it('ignores events for uploads it never dispatched', () => {
    // The manager is shared, so events for other work arrive here too.
    startOne();

    manager.emit('progress', { id: 'someone-elses-upload', status: 'uploading', progress: 50 });

    expect(queue().claims[0]!.committed).toBe(false);
  });

  it('ignores a status change for an upload it never dispatched', () => {
    startOne();

    manager.emit('statusChange', {
      id: 'someone-elses-upload',
      status: 'completed',
      progress: 100,
    });

    // Neither committed nor counted against this task's pending files.
    expect(queue().claims[0]!.committed).toBe(false);
    manager.emit('statusChange', { id: 'upload-0', status: 'failed', progress: 0 });
    expect(queue().claimedPrefixes()).toEqual([]);
  });

  it('does not release mid-dispatch when an earlier file finishes first', () => {
    // The real UploadManager emits synchronously inside addUpload and starts
    // its queue there too, so file 1 can reach a terminal state while file 3
    // is still being handed over - by which point file 1's id IS mapped, so
    // the event counts. If `pending` were counted up as files were dispatched
    // instead of set to the full total upfront, it would touch zero here and
    // free a prefix the rest of the folder is about to upload into.
    queue().reservePrefix('photos', '', 'task-folder');
    const eager = fakeManager();
    const plainAdd = eager.addUpload.bind(eager);
    const seen: string[] = [];
    eager.addUpload = (file, config) => {
      const id = plainAdd(file, config);
      seen.push(id);
      // While dispatching the second file, the first one finishes.
      if (seen.length === 2) {
        eager.emit('statusChange', { id: seen[0]!, status: 'failed', progress: 0 });
      }
      return id;
    };
    const eagerExecutor = createUploadExecutor(eager);

    eagerExecutor.start([
      folderPlan({
        files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b'), makeFile('c', 'photos/c')],
      }),
    ]);

    // Two files are still outstanding, so the name stays reserved.
    expect(queue().claimedPrefixes()).toEqual(['photos/']);

    eager.emit('statusChange', { id: seen[1]!, status: 'failed', progress: 0 });
    eager.emit('statusChange', { id: seen[2]!, status: 'failed', progress: 0 });
    expect(queue().claimedPrefixes()).toEqual([]);

    eagerExecutor.dispose();
  });

  it('survives a terminal event arriving twice', () => {
    startOne();
    manager.emit('statusChange', { id: 'upload-0', status: 'failed', progress: 0 });

    // Disposal emits a trailing cancelled per in-flight item, which can land
    // after the item already reported failure.
    manager.emit('statusChange', { id: 'upload-0', status: 'cancelled', progress: 0 });

    expect(queue().claimedPrefixes()).toEqual([]);
  });
});

describe('cancelTask', () => {
  it('cancels every upload belonging to the task', async () => {
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b')] })]);

    await executor.cancelTask('task-folder');

    expect(manager.cancelled).toEqual(['upload-0', 'upload-1']);
  });

  it('leaves other tasks running', async () => {
    executor.start([
      folderPlan({ id: 'task-a', files: [makeFile('a', 'photos/a')] }),
      folderPlan({ id: 'task-b', files: [makeFile('b', 'videos/b')] }),
    ]);

    await executor.cancelTask('task-a');

    expect(manager.cancelled).toEqual(['upload-0']);
  });

  it('frees the prefix when nothing had been written', async () => {
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    await executor.cancelTask('task-folder');

    expect(queue().claimedPrefixes()).toEqual([]);
  });

  it('keeps the prefix when bytes had already landed', async () => {
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);
    manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: 30 });

    await executor.cancelTask('task-folder');

    // Orphaned parts exist under this key; handing the name back would invite
    // a later drop to overwrite them.
    expect(queue().claimedPrefixes()).toEqual(['photos/']);
  });

  it('cancels the rest of the folder when one abort fails', async () => {
    // A failed AbortMultipartUpload is a bucket cleanup problem, not a reason
    // to leave the other five hundred files uploading.
    executor.start([
      folderPlan({
        files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b'), makeFile('c', 'photos/c')],
      }),
    ]);
    manager.failCancel.add('upload-1');

    await expect(executor.cancelTask('task-folder')).resolves.toBeUndefined();

    expect(manager.cancelled).toEqual(['upload-0', 'upload-1', 'upload-2']);
  });

  it('does nothing for an unknown task', async () => {
    await expect(executor.cancelTask('never-dispatched')).resolves.toBeUndefined();

    expect(manager.cancelled).toEqual([]);
  });
});

describe('routing state is not kept forever', () => {
  it('forgets a task once every file has finished', () => {
    // The two maps only ever grew. Ten thousand uploaded files meant ten
    // thousand id entries alive until the tab closed, long after the last one
    // finished. Nothing here pins a File, but it is still unbounded.
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b')] })]);
    expect(executor.taskFor('upload-0')).toBe('task-folder');

    manager.emit('statusChange', { id: 'upload-0', status: 'completed', progress: 100 });
    manager.emit('statusChange', { id: 'upload-1', status: 'completed', progress: 100 });

    expect(executor.taskFor('upload-0')).toBeUndefined();
    expect(executor.taskFor('upload-1')).toBeUndefined();
    expect(executor.uploadsFor('task-folder')).toEqual([]);
  });

  it('holds routing state until the last file is done', () => {
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a'), makeFile('b', 'photos/b')] })]);

    manager.emit('statusChange', { id: 'upload-0', status: 'completed', progress: 100 });

    // Still needed: upload-1 is in flight and must stay cancellable.
    expect(executor.taskFor('upload-1')).toBe('task-folder');
    expect(executor.uploadsFor('task-folder')).toEqual(['upload-0', 'upload-1']);
  });

  it('does not grow across many completed tasks', () => {
    for (let t = 0; t < 50; t++) {
      executor.start([
        folderPlan({ id: `task-${t}`, prefix: `f${t}/`, files: [makeFile('a', `f${t}/a`)] }),
      ]);
      manager.emit('statusChange', { id: `upload-${t}`, status: 'completed', progress: 100 });
    }

    // Every task settled, so nothing is retained.
    for (let t = 0; t < 50; t++) {
      expect(executor.uploadsFor(`task-${t}`)).toEqual([]);
      expect(executor.taskFor(`upload-${t}`)).toBeUndefined();
    }
  });

  it('ignores a late event for a forgotten task', () => {
    // Disposal emits a trailing cancelled per in-flight item, which can arrive
    // after the task already settled.
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);
    manager.emit('statusChange', { id: 'upload-0', status: 'completed', progress: 100 });

    expect(() =>
      manager.emit('statusChange', { id: 'upload-0', status: 'cancelled', progress: 0 })
    ).not.toThrow();
    // The commit stands - a late cancelled must not un-commit landed bytes.
    expect(queue().claims[0]).toMatchObject({ committed: true });
  });

  it('forgets a cancelled task once its uploads report back', async () => {
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    await executor.cancelTask('task-folder');
    manager.emit('statusChange', { id: 'upload-0', status: 'cancelled', progress: 0 });

    expect(executor.taskFor('upload-0')).toBeUndefined();
  });
});

describe('dispose', () => {
  it('unsubscribes from the manager', () => {
    expect(manager.listenerCount()).toBe(2);

    executor.dispose();

    expect(manager.listenerCount()).toBe(0);
  });

  it('stops reacting to events afterwards', () => {
    queue().reservePrefix('photos', '', 'task-folder');
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    executor.dispose();
    manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: 50 });

    expect(queue().claims[0]!.committed).toBe(false);
  });

  it('forgets its task mapping', () => {
    executor.start([folderPlan({ files: [makeFile('a', 'photos/a')] })]);

    executor.dispose();

    expect(executor.taskFor('upload-0')).toBeUndefined();
    expect(executor.uploadsFor('task-folder')).toEqual([]);
  });
});

describe('end to end: a planned drop reaching the manager', () => {
  it('carries a resolved rename all the way into the keys', async () => {
    // The whole point of Phase 4 surviving contact with Phase 5: the bucket
    // already holds "photos/", planning resolves to "photos (1)", and every
    // key must land under the RESOLVED name with no trace of the original.
    const plan = folderPlan({
      originalName: 'photos',
      resolvedName: 'photos (1)',
      prefix: 'photos (1)/',
      files: [
        makeFile('a.jpg', 'photos/a.jpg'),
        makeFile('b.jpg', 'photos/raw/b.jpg'),
        makeFile('c.jpg', 'photos/raw/nested/c.jpg'),
      ],
    });
    queue().reservePrefix('photos', '', 'task-folder');

    executor.start([plan]);

    expect(manager.added.map((a) => a.key)).toEqual([
      'photos (1)/a.jpg',
      'photos (1)/raw/b.jpg',
      'photos (1)/raw/nested/c.jpg',
    ]);
    // Not one key mentions the original folder name twice.
    expect(manager.added.every((a) => !a.key.includes('photos/photos'))).toBe(true);

    manager.emit('progress', { id: 'upload-0', status: 'uploading', progress: 10 });
    manager.emit('statusChange', { id: 'upload-0', status: 'completed', progress: 100 });
    manager.emit('statusChange', { id: 'upload-1', status: 'completed', progress: 100 });
    manager.emit('statusChange', { id: 'upload-2', status: 'completed', progress: 100 });

    expect(queue().claims[0]).toMatchObject({ prefix: 'photos/', committed: true });
  });
});
