/**
 * `SignedUrlUploadManager` mirrors `UploadManager`'s singleton and teardown
 * contract, but its uploads cannot be paused or resumed and its `cancel()` is
 * synchronous - there is no in-flight AbortMultipartUpload for the worker to
 * race against. Those differences are what this suite concentrates on.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignedUrlUploadManager } from './signedUrlUploadManager.js';
import type { BYOS3ApiProvider } from '../index.js';
import type { EventPayload } from '../core/types.js';

const { MockUploader, uploaderInstances } = vi.hoisted(() => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  class MockUploader {
    upload = vi.fn(async (_file: File, onProgress?: (p: number) => void) => {
      this.onProgress = onProgress;
      // A settled gate is replaced, so an automatic retry is held until the
      // test settles it too.
      if (this.gateSettled) {
        this.gate = deferred();
        this.gateSettled = false;
      }
      const gate = this.gate;
      return gate.promise.finally(() => {
        if (this.gate === gate) this.gateSettled = true;
      });
    });
    gateSettled = false;
    cancel = vi.fn();
    gate = deferred();
    onProgress?: (p: number) => void;

    /** Captured so tests can assert the key the manager derived. */
    config: { key?: string; contentType?: string };

    constructor(config: { key?: string; contentType?: string }) {
      this.config = config;
      instances.push(this);
    }
  }

  const instances: MockUploader[] = [];
  return { MockUploader, uploaderInstances: instances };
});

vi.mock('./signedUrlUploader.js', () => ({ SignedUrlUploader: MockUploader }));

const apiProvider = {} as BYOS3ApiProvider;
// No automatic retries unless a test asks: a rejected attempt is a failure.
const config = { apiProvider, retryDelaysMs: [] as number[] };

const dropped = () =>
  Object.assign(new Error('Upload failed due to network error'), { name: 'NetworkError' });
const refused = () =>
  Object.assign(new Error('Upload failed with status 403'), { $metadata: { httpStatusCode: 403 } });

function makeFile(name = 'a.txt', size = 10) {
  return new File(['x'.repeat(size)], name);
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await SignedUrlUploadManager.disposeInstance();
  uploaderInstances.length = 0;
  vi.clearAllMocks();
});

afterEach(async () => {
  await SignedUrlUploadManager.disposeInstance();
  vi.restoreAllMocks();
});

describe('getInstance', () => {
  it('returns the same instance for repeated calls', () => {
    expect(SignedUrlUploadManager.getInstance(config)).toBe(
      SignedUrlUploadManager.getInstance(config)
    );
  });

  it('IGNORES the config once an instance exists', () => {
    const first = SignedUrlUploadManager.getInstance(config);
    const second = SignedUrlUploadManager.getInstance({
      apiProvider: {} as BYOS3ApiProvider,
      maxConcurrency: 99,
    });

    expect(second).toBe(first);
  });

  it('builds a fresh instance after disposal', async () => {
    const first = SignedUrlUploadManager.getInstance(config);
    await SignedUrlUploadManager.disposeInstance();

    expect(SignedUrlUploadManager.getInstance(config)).not.toBe(first);
  });
});

describe('disposeInstance', () => {
  it('is a no-op when there is no instance', async () => {
    await expect(SignedUrlUploadManager.disposeInstance()).resolves.toBeUndefined();
  });

  it('clears the singleton synchronously', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    const disposal = SignedUrlUploadManager.disposeInstance();
    expect(SignedUrlUploadManager.getInstance(config)).not.toBe(manager);
    await disposal;
  });

  it('cancels in-flight and queued uploads', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const active = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const queued = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await SignedUrlUploadManager.disposeInstance();

    expect(manager.getStatus(active)!.status).toBe('cancelled');
    expect(manager.getStatus(queued)!.status).toBe('cancelled');
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledOnce();
  });

  it('leaves completed uploads alone', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();
    uploaderInstances[0]!.gate.resolve();
    await settle();

    await SignedUrlUploadManager.disposeInstance();

    expect(manager.getStatus(id)!.status).toBe('completed');
    expect(uploaderInstances[0]!.cancel).not.toHaveBeenCalled();
  });

  it('does not promote the next queued upload while tearing down', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await SignedUrlUploadManager.disposeInstance();
    await settle();

    expect(uploaderInstances[1]!.upload).not.toHaveBeenCalled();
  });

  it('refuses new uploads on a disposed instance', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    await SignedUrlUploadManager.disposeInstance();

    expect(() => manager.addUpload(makeFile(), { key: 'k' })).toThrow(/disposed.*getInstance/s);
  });
});

describe('queue', () => {
  it('runs at most maxConcurrency uploads at once', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 2 });
    const ids = ['a', 'b', 'c'].map((k) => manager.addUpload(makeFile(k), { key: k }));
    await settle();

    expect(
      ids.map((id) => manager.getStatus(id)!.status).filter((s) => s === 'uploading')
    ).toHaveLength(2);
  });

  it('defaults to two concurrent uploads', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const ids = ['a', 'b', 'c'].map((k) => manager.addUpload(makeFile(k), { key: k }));
    await settle();

    expect(
      ids.map((id) => manager.getStatus(id)!.status).filter((s) => s === 'uploading')
    ).toHaveLength(2);
  });

  it('starts the next upload once one finishes', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const second = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    uploaderInstances[0]!.gate.resolve();
    await settle();

    expect(manager.getStatus(second)!.status).toBe('uploading');
  });

  it('marks an upload failed when the uploader throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(new Error('signed url expired'));
    await settle();

    expect(manager.getStatus(id)).toMatchObject({
      status: 'failed',
      progress: 0,
    });
  });

  it('does not overwrite a cancelled upload with a failure', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    await manager.cancelUpload(id);
    // Cancelling aborts the request, which surfaces as a rejection.
    uploaderInstances[0]!.gate.reject(new Error('aborted'));
    await settle();

    expect(manager.getStatus(id)!.status).toBe('cancelled');
  });
});

describe('cancel', () => {
  it('cancels an in-flight upload and frees its slot', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const first = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const second = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await manager.cancelUpload(first);
    await settle();

    expect(manager.getStatus(first)!.status).toBe('cancelled');
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledOnce();
    expect(manager.getStatus(second)!.status).toBe('uploading');
  });

  it('cancels a queued upload without touching its uploader', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const queued = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await manager.cancelUpload(queued);

    expect(manager.getStatus(queued)!.status).toBe('cancelled');
    expect(uploaderInstances[1]!.cancel).not.toHaveBeenCalled();
  });

  it('ignores a repeated cancel', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    await manager.cancelUpload(id);
    await manager.cancelUpload(id);

    // A duplicate would emit a second 'cancelled' event and decrement the
    // active counter twice.
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledOnce();
  });

  it('ignores a cancel for an unknown id', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    await expect(manager.cancelUpload('nope')).resolves.toBeUndefined();
  });
});

describe('pause and resume compatibility shims', () => {
  it('cancels instead of pausing, since a signed-url PUT cannot resume', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    manager.pauseUpload(id);
    await settle();

    // Kept for API parity with UploadManager; a half-finished PUT has no
    // resumable state, so pretending otherwise would strand the upload.
    expect(manager.getStatus(id)!.status).toBe('cancelled');
  });

  it('ignores a pause for an upload that is not running', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const queued = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    manager.pauseUpload(queued);

    expect(manager.getStatus(queued)!.status).toBe('queued');
  });

  it('ignores a pause for an unknown id', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    expect(() => manager.pauseUpload('nope')).not.toThrow();
  });

  it('resume is an inert no-op', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    await expect(manager.resumeUpload(id)).resolves.toBeUndefined();
    expect(manager.getStatus(id)!.status).toBe('uploading');
  });
});

describe('status reporting', () => {
  it('returns undefined for an unknown id', () => {
    expect(SignedUrlUploadManager.getInstance(config).getStatus('nope')).toBeUndefined();
  });

  it('reports every upload it knows about', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const a = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const b = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    expect(manager.getAllStatuses()).toEqual({
      [a]: { status: 'uploading', progress: 0 },
      [b]: { status: 'queued', progress: 0 },
    });
  });
});

describe('events', () => {
  it('emits a status change when an upload is queued', () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const listener = vi.fn();
    manager.on('statusChange', listener);

    const id = manager.addUpload(makeFile(), { key: 'k' });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id, status: 'queued', progress: 0 })
    );
  });

  it('forwards uploader progress to subscribers', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const events: EventPayload[] = [];
    manager.on('progress', (p) => events.push(p));
    manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.onProgress!(75);

    expect(events).toEqual([expect.objectContaining({ progress: 75 })]);
  });

  it('stops delivering to a removed listener', () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const listener = vi.fn();
    manager.on('statusChange', listener);
    manager.off('statusChange', listener);

    manager.addUpload(makeFile(), { key: 'k' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('off is harmless for an event with no listeners', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    expect(() => manager.off('progress', vi.fn())).not.toThrow();
  });

  it('isolates listeners so one throwing does not break the others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = SignedUrlUploadManager.getInstance(config);
    const healthy = vi.fn();
    manager.on('statusChange', () => {
      throw new Error('listener exploded');
    });
    manager.on('statusChange', healthy);

    manager.addUpload(makeFile(), { key: 'k' });

    expect(healthy).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});

describe('automatic retry', () => {
  const retrying = { ...config, retryDelaysMs: [0, 0, 0] };

  it('tries a dropped connection again, and completes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = SignedUrlUploadManager.getInstance(retrying);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(dropped());
    await settle();
    expect(uploaderInstances[0]!.upload).toHaveBeenCalledTimes(2);

    uploaderInstances[0]!.gate.resolve();
    await settle();
    expect(manager.getStatus(id)).toMatchObject({ status: 'completed' });
  });

  it('does not retry a refusal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = SignedUrlUploadManager.getInstance(retrying);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(refused());
    await settle();

    expect(manager.getStatus(id)).toMatchObject({ status: 'failed' });
    expect(uploaderInstances[0]!.upload).toHaveBeenCalledTimes(1);
  });

  it('gives up after its last retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = SignedUrlUploadManager.getInstance(retrying);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    for (let attempt = 0; attempt < 4; attempt++) {
      uploaderInstances[0]!.gate.reject(dropped());
      await settle();
    }

    expect(uploaderInstances[0]!.upload).toHaveBeenCalledTimes(4);
    expect(manager.getStatus(id)).toMatchObject({ status: 'failed' });
  });
});

describe('retryUpload', () => {
  it('sends a failed upload again, with a fresh uploader', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k', contentType: 'image/png' });
    await settle();
    uploaderInstances[0]!.gate.reject(refused());
    await settle();

    expect(manager.retryUpload(id)).toBe(true);
    await settle();
    expect(uploaderInstances[1]!.config).toMatchObject({ key: 'k', contentType: 'image/png' });

    uploaderInstances[1]!.gate.resolve();
    await settle();
    expect(manager.getStatus(id)).toMatchObject({ status: 'completed' });
  });

  it('refuses anything that has not failed', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    expect(manager.retryUpload(id)).toBe(false);
  });

  /**
   * Retried from inside the 'failed' event, which is emitted before the
   * failed worker has finished. That worker gave its slot back only if the
   * upload was still 'failed', and by then the retry had moved it on, so the
   * slot was lost: with one slot the retry never ran, and with more every
   * such retry ran one fewer upload at a time.
   */
  describe('from inside its failed event', () => {
    function retryOnFailure(manager: SignedUrlUploadManager) {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      manager.on('statusChange', (payload) => {
        if (payload.status === 'failed') manager.retryUpload(payload.id);
      });
    }

    it('still runs the retry with the only slot', async () => {
      const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 1 });
      retryOnFailure(manager);
      const id = manager.addUpload(makeFile(), { key: 'k' });
      await settle();

      uploaderInstances[0]!.gate.reject(refused());
      await settle();

      expect(manager.getStatus(id)).toMatchObject({ status: 'uploading' });
      uploaderInstances[1]!.gate.resolve();
      await settle();
      expect(manager.getStatus(id)).toMatchObject({ status: 'completed' });
    });

    it('keeps the concurrency limit afterwards', async () => {
      const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 2 });
      retryOnFailure(manager);
      manager.addUpload(makeFile(), { key: 'k' });
      await settle();
      uploaderInstances[0]!.gate.reject(refused());
      await settle();
      uploaderInstances[1]!.gate.resolve();
      await settle();

      const more = ['b', 'c', 'd'].map((key) => manager.addUpload(makeFile(), { key }));
      await settle();
      expect(more.map((other) => manager.getStatus(other)!.status)).toEqual([
        'uploading',
        'uploading',
        'queued',
      ]);
    });

    it("leaves the retry's uploader alone", async () => {
      const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 2 });
      retryOnFailure(manager);
      const id = manager.addUpload(makeFile(), { key: 'k' });
      await settle();

      uploaderInstances[0]!.gate.reject(refused());
      await settle();

      // Cancelling needs it: the failed worker used to clear it on its way out.
      await manager.cancelUpload(id);
      expect(uploaderInstances[1]!.cancel).toHaveBeenCalledOnce();
    });
  });
});

describe('content type', () => {
  it('hands each upload the content type it was given', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    manager.addUpload(makeFile('IMG_0001.HEIC'), { key: 'a', contentType: 'image/heic' });

    expect(uploaderInstances[0]!.config.contentType).toBe('image/heic');
  });
});

describe('addFolderUpload', () => {
  function fileList(files: File[]) {
    return files as unknown as FileList;
  }

  function withPath(name: string, path: string, size = 10) {
    const file = new File(['x'.repeat(size)], name);
    Object.defineProperty(file, 'webkitRelativePath', { value: path });
    return file;
  }

  it('queues one upload per file', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    const { fileIds } = manager.addFolderUpload(
      fileList([withPath('a.txt', 'docs/a.txt'), withPath('b.txt', 'docs/sub/b.txt')]),
      {}
    );

    expect(fileIds).toHaveLength(2);
    // The key must be the file's path within the folder, not its bare name -
    // otherwise a nested folder upload flattens into the destination root.
    expect(uploaderInstances.map((u) => u.config.key)).toEqual(['docs/a.txt', 'docs/sub/b.txt']);
  });

  it('prefixes each key when a base prefix is given', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    const { fileIds } = manager.addFolderUpload(fileList([withPath('a.txt', 'docs/a.txt')]), {
      basePrefix: 'users/alice/',
    });

    expect(fileIds).toHaveLength(1);
    // Asserting the count alone would pass even if basePrefix were ignored
    // entirely, which is the whole behaviour this test exists to cover.
    expect(uploaderInstances[0]!.config.key).toBe('users/alice/docs/a.txt');
  });

  it('returns a folder id that groups the batch', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    const { folderId } = manager.addFolderUpload(fileList([withPath('a.txt', 'docs/a.txt')]), {});

    expect(folderId).toMatch(/^[0-9a-f-]{36}$/);
  });

  // See UploadManager's addFolderUpload suite for each of these.
  it('uploads the empty files in a folder, such as __init__.py and LICENSE', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    const { fileIds } = manager.addFolderUpload(
      fileList([
        withPath('__init__.py', 'pkg/__init__.py', 0),
        withPath('LICENSE', 'pkg/LICENSE', 0),
      ]),
      {}
    );

    expect(fileIds).toHaveLength(2);
    expect(uploaderInstances.map((u) => u.config.key)).toEqual(['pkg/__init__.py', 'pkg/LICENSE']);
  });

  it('skips the entry a dropped folder adds, which has no path and no type', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    const { fileIds } = manager.addFolderUpload(
      fileList([new File([], 'photos'), new File([new Uint8Array(96)], 'videos')]),
      { basePrefix: 'docs/' }
    );

    expect(fileIds).toEqual([]);
  });

  it('keys a file with no path by its name, not by the folder', () => {
    const manager = SignedUrlUploadManager.getInstance(config);

    manager.addFolderUpload(fileList([new File(['x'], 'notes.txt', { type: 'text/plain' })]), {
      basePrefix: 'docs/',
    });

    expect(uploaderInstances[0]!.config.key).toBe('docs/notes.txt');
  });
});

describe('resource release', () => {
  /** See UploadManager's equivalent suite for why this reaches into the map. */
  const itemOf = (manager: SignedUrlUploadManager, id: string) =>
    (
      manager as unknown as { uploads: Map<string, { file?: File; uploader?: unknown }> }
    ).uploads.get(id);

  it('drops the file and uploader once an upload completes', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    expect(itemOf(manager, id)!.file).toBeInstanceOf(File);

    uploaderInstances[0]!.gate.resolve();
    await settle();

    expect(manager.getStatus(id)!.status).toBe('completed');
    expect(itemOf(manager, id)!.file).toBeUndefined();
    expect(itemOf(manager, id)!.uploader).toBeUndefined();
  });

  it('keeps the file of a failed upload, so it can be retried, but drops its uploader', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    uploaderInstances[0]!.gate.reject(new Error('signed url expired'));
    await settle();

    expect(manager.getStatus(id)!.status).toBe('failed');
    expect(itemOf(manager, id)!.file).toBeInstanceOf(File);
    expect(itemOf(manager, id)!.uploader).toBeUndefined();
  });

  it('drops them when an upload is cancelled', async () => {
    const manager = SignedUrlUploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    await manager.cancelUpload(id);

    expect(manager.getStatus(id)!.status).toBe('cancelled');
    expect(itemOf(manager, id)!.file).toBeUndefined();
  });

  it('keeps the queue moving after many completions', async () => {
    const manager = SignedUrlUploadManager.getInstance({ ...config, maxConcurrency: 2 });
    const ids = Array.from({ length: 6 }, (_, i) => manager.addUpload(makeFile(), { key: `${i}` }));

    for (let i = 0; i < 6; i++) {
      await settle();
      uploaderInstances[i]!.gate.resolve();
      await settle();
    }

    expect(ids.map((id) => manager.getStatus(id)!.status)).toEqual(Array(6).fill('completed'));
  });
});
