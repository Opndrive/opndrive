/**
 * `UploadManager` is an exported singleton whose `getInstance` silently
 * discards its config once an instance exists. That makes `disposeInstance()`
 * a correctness requirement rather than a nicety: without it, uploads started
 * after a session change keep targeting the previous session's bucket and
 * credentials.
 *
 * `MultipartUploader` is mocked at the module boundary - what's under test is
 * the queue, the state machine, and the teardown, not the S3 wire protocol.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { UploadManager } from './uploadManager.js';
import type { EventPayload } from '../core/types.js';

/**
 * Hoisted so the class exists before `vi.mock`'s factory runs - the factory is
 * evaluated when `uploadManager.js` first imports the uploader, which is before
 * this module's own top-level bindings are initialised.
 */
const { MockUploader, uploaderInstances } = vi.hoisted(() => {
  /** Resolves only when the test says so, so an upload can be held "in flight". */
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
    start = vi.fn(async (_file: File, onProgress?: (p: number) => void) => {
      this.onProgress = onProgress;
      return this.attempt();
    });
    resume = vi.fn(async (_file: File, onProgress?: (p: number) => void) => {
      this.onProgress = onProgress;
      return this.attempt();
    });

    /**
     * Each attempt waits on `gate`. A settled gate is replaced first, so an
     * automatic retry is held until the test settles it too.
     */
    private attempt() {
      if (this.gateSettled) {
        this.gate = deferred();
        this.gateSettled = false;
      }
      const gate = this.gate;
      return gate.promise.finally(() => {
        if (this.gate === gate) this.gateSettled = true;
      });
    }
    gateSettled = false;
    pause = vi.fn();
    cancel = vi.fn(async () => {});
    gate = deferred();
    onProgress?: (p: number) => void;
    uploadId?: string;

    /** Captured so tests can assert what the manager handed over. */
    config: { key?: string; contentType?: string };

    constructor(config: { key?: string; contentType?: string }) {
      this.config = config;
      instances.push(this);
    }
  }

  const instances: MockUploader[] = [];
  return { MockUploader, uploaderInstances: instances };
});

vi.mock('./multipartUploader.js', () => ({ MultipartUploader: MockUploader }));

const config = {
  s3: {} as S3Client,
  bucket: 'test-bucket',
  prefix: 'users/alice/',
  // No automatic retries unless a test asks for them, so a rejected attempt
  // means a failed upload. See 'automatic retry' for the rest.
  retryDelaysMs: [] as number[],
};

/** An error with no HTTP status, as a dropped connection produces. */
const dropped = () => Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });

/** An error S3 will give again however often it is asked. */
const refused = () =>
  Object.assign(new Error('Access Denied'), {
    name: 'AccessDenied',
    $metadata: { httpStatusCode: 403 },
  });

function makeFile(name = 'a.txt', size = 10) {
  return new File(['x'.repeat(size)], name);
}

/** Waits for the queue's detached worker to pick an item up. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await UploadManager.disposeInstance();
  uploaderInstances.length = 0;
  vi.clearAllMocks();
});

afterEach(async () => {
  await UploadManager.disposeInstance();
  vi.restoreAllMocks();
});

describe('getInstance', () => {
  it('returns the same instance for repeated calls', () => {
    expect(UploadManager.getInstance(config)).toBe(UploadManager.getInstance(config));
  });

  it('IGNORES the config once an instance exists', () => {
    const first = UploadManager.getInstance(config);
    const second = UploadManager.getInstance({ ...config, bucket: 'a-different-bucket' });

    // This is the whole reason disposeInstance() has to be called on logout:
    // handing getInstance new credentials does nothing at all.
    expect(second).toBe(first);
  });

  it('builds a fresh instance after disposal', async () => {
    const first = UploadManager.getInstance(config);
    await UploadManager.disposeInstance();

    expect(UploadManager.getInstance(config)).not.toBe(first);
  });
});

describe('disposeInstance', () => {
  it('is a no-op when there is no instance', async () => {
    await expect(UploadManager.disposeInstance()).resolves.toBeUndefined();
  });

  it('clears the singleton synchronously, before awaiting cancellation', async () => {
    const manager = UploadManager.getInstance(config);
    manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    const disposal = UploadManager.disposeInstance(); // deliberately not awaited
    const replacement = UploadManager.getInstance(config);

    // A logout handler that cannot await must still be guaranteed that the
    // next getInstance() gives it a manager bound to the new session.
    expect(replacement).not.toBe(manager);
    await disposal;
  });

  it('cancels an in-flight upload', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();
    expect(manager.getStatus(id)!.status).toBe('uploading');

    await UploadManager.disposeInstance();

    expect(manager.getStatus(id)!.status).toBe('cancelled');
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledOnce();
  });

  it('cancels queued uploads that never started', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const active = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const queued = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await UploadManager.disposeInstance();

    expect(manager.getStatus(active)!.status).toBe('cancelled');
    expect(manager.getStatus(queued)!.status).toBe('cancelled');
  });

  it('leaves already-completed uploads alone', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();
    uploaderInstances[0]!.gate.resolve();
    await settle();
    expect(manager.getStatus(id)!.status).toBe('completed');

    await UploadManager.disposeInstance();

    // Re-cancelling a terminal item would emit a bogus 'cancelled' event and
    // double-decrement the active counter.
    expect(manager.getStatus(id)!.status).toBe('completed');
    expect(uploaderInstances[0]!.cancel).not.toHaveBeenCalled();
  });

  it('does not start the next queued upload while tearing down', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await UploadManager.disposeInstance();
    await settle();

    // Cancelling the active item calls processQueue(); without the isDisposed
    // guard that would promote 'b' and upload it to the bucket being torn down.
    expect(uploaderInstances[1]!.start).not.toHaveBeenCalled();
  });

  it('reports a failed cancellation instead of throwing out of dispose', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance(config);
    manager.addUpload(makeFile(), { key: 'k' });
    await settle();
    uploaderInstances[0]!.cancel.mockRejectedValueOnce(new Error('abort failed'));

    await expect(UploadManager.disposeInstance()).resolves.toBeUndefined();

    // A failed AbortMultipartUpload orphans a multipart upload that keeps
    // accruing storage charges, so it must be surfaced, not swallowed silently.
    expect(error).toHaveBeenCalled();
    expect(error.mock.calls.flat().join(' ')).toMatch(/orphaned/);
  });

  it('refuses new uploads on a disposed instance', async () => {
    const manager = UploadManager.getInstance(config);
    await UploadManager.disposeInstance();

    expect(() => manager.addUpload(makeFile(), { key: 'k' })).toThrow(/disposed.*getInstance/s);
  });

  it('ignores a resume request on a disposed instance', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();
    await UploadManager.disposeInstance();

    await expect(manager.resumeUpload(id)).resolves.toBeUndefined();
    expect(manager.getStatus(id)!.status).toBe('cancelled');
  });
});

describe('queue', () => {
  it('runs at most maxConcurrency uploads at once', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 2 });
    const ids = ['a', 'b', 'c', 'd'].map((k) => manager.addUpload(makeFile(k), { key: k }));
    await settle();

    const statuses = ids.map((id) => manager.getStatus(id)!.status);
    expect(statuses.filter((s) => s === 'uploading')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'queued')).toHaveLength(2);
  });

  it('defaults to two concurrent uploads', async () => {
    const manager = UploadManager.getInstance(config);
    const ids = ['a', 'b', 'c'].map((k) => manager.addUpload(makeFile(k), { key: k }));
    await settle();

    expect(
      ids.map((id) => manager.getStatus(id)!.status).filter((s) => s === 'uploading')
    ).toHaveLength(2);
  });

  it('starts the next upload when one completes', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const second = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    uploaderInstances[0]!.gate.resolve();
    await settle();

    expect(manager.getStatus(second)!.status).toBe('uploading');
  });

  it('marks an upload failed when the uploader throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(new Error('network died'));
    await settle();

    expect(manager.getStatus(id)).toMatchObject({ status: 'failed' });
  });

  it('aborts a failed upload on the server, so its parts are not left billing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(new Error('network died'));
    await settle();

    // Nothing resumes a failed upload, so the parts it sent would otherwise
    // stay in the bucket, invisible, until a lifecycle rule removed them.
    expect(manager.getStatus(id)).toMatchObject({ status: 'failed' });
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledTimes(1);
  });

  it('still fails cleanly, and frees the slot, when that abort fails too', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const failing = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const next = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();
    uploaderInstances[0]!.cancel.mockRejectedValueOnce(new Error('still offline'));

    uploaderInstances[0]!.gate.reject(new Error('network died'));
    await settle();

    expect(manager.getStatus(failing)).toMatchObject({ status: 'failed' });
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('Its parts may be left in the bucket'),
      expect.any(Error)
    );
    expect(manager.getStatus(next)).toMatchObject({ status: 'uploading' });
  });

  it('does not start the next upload until the abort is done', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const next = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();
    let finishAbort!: () => void;
    uploaderInstances[0]!.cancel.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishAbort = resolve))
    );

    uploaderInstances[0]!.gate.reject(new Error('network died'));
    await settle();
    expect(manager.getStatus(next)).toMatchObject({ status: 'queued' });

    finishAbort();
    await settle();
    expect(manager.getStatus(next)).toMatchObject({ status: 'uploading' });
  });

  it('does not abort an upload that was paused rather than failed', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    manager.pauseUpload(id);
    // A paused part ends in a rejection too. It is still resumable.
    uploaderInstances[0]!.gate.reject(new Error('aborted'));
    await settle();

    expect(manager.getStatus(id)).toMatchObject({ status: 'paused' });
    expect(uploaderInstances[0]!.cancel).not.toHaveBeenCalled();
  });

  it('resumes an upload that already has an uploadId', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    await settle();
    // Simulate a part-way upload being requeued.
    uploaderInstances[0]!.uploadId = 'existing-upload';
    manager.pauseUpload(Object.keys(manager.getAllStatuses())[0]!);
    await manager.resumeUpload(Object.keys(manager.getAllStatuses())[0]!);
    await settle();

    expect(uploaderInstances[0]!.resume).toHaveBeenCalled();
  });
});

describe('pause, resume, and cancel', () => {
  it('pauses an uploading item and frees a concurrency slot', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const first = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const second = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    manager.pauseUpload(first);
    await settle();

    expect(manager.getStatus(first)!.status).toBe('paused');
    expect(uploaderInstances[0]!.pause).toHaveBeenCalledOnce();
    expect(manager.getStatus(second)!.status).toBe('uploading');
  });

  it('ignores a pause for an item that is not uploading', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const queued = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    manager.pauseUpload(queued);

    expect(manager.getStatus(queued)!.status).toBe('queued');
  });

  it('puts a resumed upload at the FRONT of the queue', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    const first = manager.addUpload(makeFile('a.txt'), { key: 'a' });
    manager.addUpload(makeFile('b.txt'), { key: 'b' });
    const last = manager.addUpload(makeFile('c.txt'), { key: 'c' });
    await settle();

    manager.pauseUpload(first); // frees the slot, so 'b' starts
    await settle();
    await manager.resumeUpload(first); // no slot yet - goes to the queue head
    expect(manager.getStatus(first)!.status).toBe('queued');

    uploaderInstances[1]!.gate.resolve(); // 'b' finishes, freeing the slot
    await settle();

    // The user just asked for this file specifically; making them wait behind
    // everything queued since would feel broken.
    expect(manager.getStatus(first)!.status).toBe('uploading');
    expect(manager.getStatus(last)!.status).toBe('queued');
  });

  it('cancels a queued upload without touching the uploader', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const queued = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    await manager.cancelUpload(queued);

    expect(manager.getStatus(queued)!.status).toBe('cancelled');
    // Never started, so there is no multipart upload to abort.
    expect(uploaderInstances[1]!.cancel).not.toHaveBeenCalled();
  });

  it('does not emit a bogus completion for an upload cancelled mid-flight', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    const cancelling = manager.cancelUpload(id);
    // The worker unwinds normally while AbortMultipartUpload is in flight.
    uploaderInstances[0]!.gate.resolve();
    await cancelling;
    await settle();

    // Status is marked terminal BEFORE awaiting the uploader precisely so the
    // resolving worker cannot transition this to 'completed'.
    expect(manager.getStatus(id)!.status).toBe('cancelled');
  });

  it('ignores a repeated cancel', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    await manager.cancelUpload(id);
    await manager.cancelUpload(id);

    // Re-running the bookkeeping would double-decrement activeUploads and
    // permanently shrink the effective concurrency.
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledOnce();
  });

  it('ignores a cancel for an unknown id', async () => {
    const manager = UploadManager.getInstance(config);

    await expect(manager.cancelUpload('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('status reporting', () => {
  it('returns undefined for an unknown id', () => {
    expect(UploadManager.getInstance(config).getStatus('nope')).toBeUndefined();
  });

  it('reports every upload it knows about', async () => {
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 1 });
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
    const manager = UploadManager.getInstance(config);
    const listener = vi.fn();
    manager.on('statusChange', listener);

    const id = manager.addUpload(makeFile(), { key: 'k' });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id, status: 'queued', progress: 0 })
    );
  });

  it('forwards uploader progress to subscribers', async () => {
    const manager = UploadManager.getInstance(config);
    const events: EventPayload[] = [];
    manager.on('progress', (p) => events.push(p));
    manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.onProgress!(42);

    expect(events).toEqual([expect.objectContaining({ progress: 42 })]);
  });

  it('stops delivering to a removed listener', async () => {
    const manager = UploadManager.getInstance(config);
    const listener = vi.fn();
    manager.on('statusChange', listener);
    manager.off('statusChange', listener);

    manager.addUpload(makeFile(), { key: 'k' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('off is harmless for an event with no listeners', () => {
    const manager = UploadManager.getInstance(config);

    expect(() => manager.off('progress', vi.fn())).not.toThrow();
  });

  it('isolates listeners so one throwing does not break the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance(config);
    const healthy = vi.fn();
    manager.on('statusChange', () => {
      throw new Error('listener exploded');
    });
    manager.on('statusChange', healthy);

    manager.addUpload(makeFile(), { key: 'k' });

    // During disposeInstance a throwing listener would otherwise propagate up
    // through updateItemStatus -> cancelUpload and abandon the remaining
    // uploads mid-teardown.
    expect(healthy).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});

/**
 * Failures that may clear by themselves - a dropped connection, a 503 - are
 * tried again, a little later each time. They used to fail the upload for
 * good on the first one.
 */
describe('automatic retry', () => {
  const retrying = { ...config, retryDelaysMs: [0, 0, 0] };

  it('tries a dropped connection again, and completes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = UploadManager.getInstance(retrying);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(dropped());
    await settle();
    // Still going, on its second attempt.
    expect(manager.getStatus(id)).toMatchObject({ status: 'uploading' });
    expect(uploaderInstances[0]!.start).toHaveBeenCalledTimes(2);

    uploaderInstances[0]!.gate.resolve();
    await settle();
    expect(manager.getStatus(id)).toMatchObject({ status: 'completed' });
  });

  it('resumes the multipart session rather than starting over', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = UploadManager.getInstance(retrying);
    manager.addUpload(makeFile(), { key: 'k' });
    await settle();
    // The first attempt opened a session before it failed.
    uploaderInstances[0]!.uploadId = 'upload-1';

    uploaderInstances[0]!.gate.reject(dropped());
    await settle();

    // The parts already on S3 stay there. Only the rest are sent.
    expect(uploaderInstances[0]!.resume).toHaveBeenCalledTimes(1);
    expect(uploaderInstances).toHaveLength(1);
  });

  it('does not retry a refusal that will only come back the same', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance(retrying);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(refused());
    await settle();

    expect(manager.getStatus(id)).toMatchObject({ status: 'failed' });
    expect(uploaderInstances[0]!.start).toHaveBeenCalledTimes(1);
  });

  it('gives up after its last retry, and then cleans up', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = UploadManager.getInstance(retrying);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    for (let attempt = 0; attempt < 4; attempt++) {
      uploaderInstances[0]!.gate.reject(dropped());
      await settle();
    }

    // One attempt and three retries.
    expect(uploaderInstances[0]!.start).toHaveBeenCalledTimes(4);
    expect(manager.getStatus(id)).toMatchObject({ status: 'failed' });
    expect(uploaderInstances[0]!.cancel).toHaveBeenCalledTimes(1);
  });

  it('stops retrying once the upload is paused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = UploadManager.getInstance({ ...config, retryDelaysMs: [50] });
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(dropped());
    await settle();
    // Paused during the wait before the retry.
    manager.pauseUpload(id);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(manager.getStatus(id)).toMatchObject({ status: 'paused' });
    expect(uploaderInstances[0]!.start).toHaveBeenCalledTimes(1);
  });

  it('stops retrying once the upload is cancelled', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = UploadManager.getInstance({ ...config, retryDelaysMs: [50] });
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    uploaderInstances[0]!.gate.reject(dropped());
    await settle();
    await manager.cancelUpload(id);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(manager.getStatus(id)).toMatchObject({ status: 'cancelled' });
    expect(uploaderInstances[0]!.start).toHaveBeenCalledTimes(1);
  });

  it('keeps its concurrency slot while it waits to retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = UploadManager.getInstance({
      ...config,
      maxConcurrency: 1,
      retryDelaysMs: [50],
    });
    manager.addUpload(makeFile('a.txt'), { key: 'a' });
    const next = manager.addUpload(makeFile('b.txt'), { key: 'b' });
    await settle();

    uploaderInstances[0]!.gate.reject(dropped());
    await settle();

    // Letting the next one start would mean two uploads at once once the
    // retry begins.
    expect(manager.getStatus(next)).toMatchObject({ status: 'queued' });
  });
});

describe('retryUpload', () => {
  async function failedUpload(manager: UploadManager) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = manager.addUpload(makeFile('a.txt'), { key: 'a', contentType: 'text/plain' });
    await settle();
    uploaderInstances[0]!.gate.reject(refused());
    await settle();
    return id;
  }

  it('sends a failed upload again, with a fresh uploader', async () => {
    const manager = UploadManager.getInstance(config);
    const id = await failedUpload(manager);

    expect(manager.retryUpload(id)).toBe(true);
    await settle();

    // The first uploader's session was aborted when it failed.
    expect(uploaderInstances).toHaveLength(2);
    expect(uploaderInstances[1]!.config).toMatchObject({ key: 'a', contentType: 'text/plain' });
    expect(manager.getStatus(id)).toMatchObject({ status: 'uploading' });

    uploaderInstances[1]!.gate.resolve();
    await settle();
    expect(manager.getStatus(id)).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('starts it from zero and announces that', async () => {
    const manager = UploadManager.getInstance(config);
    const id = await failedUpload(manager);
    const changes: EventPayload[] = [];
    manager.on('statusChange', (payload) => changes.push(payload));

    manager.retryUpload(id);

    expect(changes[0]).toMatchObject({ id, status: 'queued', progress: 0 });
  });

  it('refuses anything that has not failed', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'k' });
    await settle();

    expect(manager.retryUpload(id)).toBe(false);
    expect(manager.retryUpload('no-such-id')).toBe(false);
  });

  it('refuses on a disposed manager', async () => {
    const manager = UploadManager.getInstance(config);
    const id = await failedUpload(manager);
    await UploadManager.disposeInstance();

    expect(manager.retryUpload(id)).toBe(false);
  });
});

describe('content type', () => {
  it('hands each upload the content type it was given', () => {
    const manager = UploadManager.getInstance(config);

    manager.addUpload(makeFile('IMG_0001.HEIC'), { key: 'a', contentType: 'image/heic' });

    expect(uploaderInstances[0]!.config.contentType).toBe('image/heic');
  });

  it('leaves it to the uploader when none is given', () => {
    const manager = UploadManager.getInstance(config);

    manager.addUpload(makeFile('a.txt'), { key: 'a' });

    expect(uploaderInstances[0]!.config.contentType).toBeUndefined();
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

  it('queues one upload per file, keyed by its relative path', () => {
    const manager = UploadManager.getInstance(config);

    const { fileIds } = manager.addFolderUpload(
      fileList([withPath('a.txt', 'docs/a.txt'), withPath('b.txt', 'docs/sub/b.txt')]),
      {}
    );

    expect(fileIds).toHaveLength(2);
    // The key must be the file's path within the folder, not its bare name -
    // otherwise a nested folder upload flattens into the destination root.
    expect(uploaderInstances.map((u) => u.config.key)).toEqual(['docs/a.txt', 'docs/sub/b.txt']);
    expect(Object.keys(manager.getAllStatuses())).toEqual(fileIds);
  });

  it('prefixes each key when a base prefix is given', () => {
    const manager = UploadManager.getInstance(config);
    const { fileIds } = manager.addFolderUpload(fileList([withPath('a.txt', 'docs/a.txt')]), {
      basePrefix: 'users/alice/',
    });

    expect(fileIds).toHaveLength(1);
    // Asserting the count alone would pass even if basePrefix were ignored
    // entirely, which is the whole behaviour this test exists to cover.
    expect(uploaderInstances[0]!.config.key).toBe('users/alice/docs/a.txt');
  });

  it('returns a folder id that groups the batch', () => {
    const manager = UploadManager.getInstance(config);

    const { folderId } = manager.addFolderUpload(fileList([withPath('a.txt', 'docs/a.txt')]), {});

    expect(folderId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('skips the zero-byte entries browsers emit for directories', () => {
    const manager = UploadManager.getInstance(config);
    const directoryEntry = new File([], 'subdir');
    Object.defineProperty(directoryEntry, 'webkitRelativePath', { value: 'docs/subdir' });

    const { fileIds } = manager.addFolderUpload(
      fileList([directoryEntry, withPath('a.txt', 'docs/a.txt')]),
      {}
    );

    // Uploading these would create phantom zero-byte objects shadowing real
    // folder prefixes.
    expect(fileIds).toHaveLength(1);
  });
});

describe('resource release', () => {
  /**
   * The manager keeps every item it has been given so `getStatus` can still
   * answer for finished work. That is the documented contract, and it is also
   * why the payload has to be dropped explicitly: without this, a session that
   * uploaded ten thousand files held ten thousand `File` handles and ten
   * thousand uploaders until logout.
   *
   * Reaching into the private map is deliberate. There is no public read of an
   * item's payload - that is the point - so the retention it fixes is only
   * observable from the inside.
   */
  const itemOf = (manager: UploadManager, id: string) =>
    (
      manager as unknown as { uploads: Map<string, { file?: File; uploader?: unknown }> }
    ).uploads.get(id);

  it('drops the file and uploader once an upload completes', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    expect(itemOf(manager, id)!.file).toBeInstanceOf(File);

    uploaderInstances[0]!.gate.resolve();
    await settle();

    expect(manager.getStatus(id)!.status).toBe('completed');
    // The status record survives; the payload does not.
    expect(itemOf(manager, id)!.file).toBeUndefined();
    expect(itemOf(manager, id)!.uploader).toBeUndefined();
  });

  it('keeps the file of a failed upload, so it can be retried, but drops its uploader', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    uploaderInstances[0]!.gate.reject(new Error('network died'));
    await settle();

    // The uploader's session was aborted, so it is no use to anyone. The file
    // is what retryUpload() sends again.
    expect(manager.getStatus(id)!.status).toBe('failed');
    expect(itemOf(manager, id)!.file).toBeDefined();
    expect(itemOf(manager, id)!.uploader).toBeUndefined();
  });

  it('drops them when an upload is cancelled', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    await manager.cancelUpload(id);

    expect(manager.getStatus(id)!.status).toBe('cancelled');
    expect(itemOf(manager, id)!.file).toBeUndefined();
  });

  it('drops them even when the abort round-trip fails', async () => {
    // A failed AbortMultipartUpload still has to free the handle - the
    // orphaned parts are the bucket's problem, not the browser's.
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();
    uploaderInstances[0]!.cancel.mockRejectedValueOnce(new Error('abort failed'));

    await expect(manager.cancelUpload(id)).rejects.toThrow('abort failed');

    expect(itemOf(manager, id)!.file).toBeUndefined();
  });

  it('keeps them while an upload is paused', async () => {
    // A paused item must be able to resume, which needs the uploader's
    // in-progress uploadId and the file itself.
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();

    manager.pauseUpload(id);

    expect(manager.getStatus(id)!.status).toBe('paused');
    expect(itemOf(manager, id)!.file).toBeInstanceOf(File);
    expect(itemOf(manager, id)!.uploader).toBeDefined();
  });

  it('resumes correctly after a pause', async () => {
    // Negative control for the test above: if pausing released the payload,
    // the resumed worker would have nothing to upload.
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();
    manager.pauseUpload(id);
    uploaderInstances[0]!.uploadId = 'mpu-1';

    await manager.resumeUpload(id);
    await settle();

    expect(manager.getStatus(id)!.status).toBe('uploading');
    expect(uploaderInstances[0]!.resume).toHaveBeenCalledOnce();
  });

  it('keeps the queue moving after many completions', async () => {
    // The reason this is release-and-not-delete. The worker's `finally` reads
    // the map to decide whether to free a concurrency slot; deleting the entry
    // would leave activeUploads pinned and stall the queue permanently once
    // maxConcurrency items had finished.
    const manager = UploadManager.getInstance({ ...config, maxConcurrency: 2 });
    const ids = Array.from({ length: 6 }, (_, i) => manager.addUpload(makeFile(), { key: `${i}` }));

    for (let i = 0; i < 6; i++) {
      await settle();
      uploaderInstances[i]!.gate.resolve();
      await settle();
    }

    expect(ids.map((id) => manager.getStatus(id)!.status)).toEqual(Array(6).fill('completed'));
  });

  it('still reports finished uploads through getAllStatuses', async () => {
    const manager = UploadManager.getInstance(config);
    const id = manager.addUpload(makeFile(), { key: 'a.txt' });
    await settle();
    uploaderInstances[0]!.gate.resolve();
    await settle();

    expect(manager.getAllStatuses()[id]).toEqual({ status: 'completed', progress: 100 });
  });
});
