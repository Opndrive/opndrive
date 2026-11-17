/**
 * `MultipartUploader` drives a real S3 multipart session: create, upload parts
 * with bounded concurrency, complete. The interesting behaviour is everything
 * around the unhappy path - pausing mid-flight, resuming against parts S3
 * already holds, and aborting so no orphaned multipart upload is left accruing
 * storage charges.
 *
 * Everything it needs to resume is held in memory. It used to write that state
 * to `localStorage` as well, after every part - file name, key and upload id -
 * where nothing ever read it back and an interrupted upload left it for good.
 * These suites run against a `localStorage` that records every call, and one
 * group of them checks the record stays empty.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import { MultipartUploader } from './multipartUploader.js';

const s3Mock = mockClient(S3Client);
const MB = 1024 * 1024;

/** Every call made on `localStorage`, by method name. Should stay empty. */
let storageCalls: string[];

/**
 * A `localStorage` that works and writes down what was asked of it.
 *
 * Working matters: a stub that threw would also catch a stray write, but only
 * by failing whichever test happened to trigger it, with an error about
 * storage in a test about pausing.
 */
function installLocalStorage() {
  storageCalls = [];
  const held = new Map<string, string>();
  const record =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      storageCalls.push(name);
      return fn(...args);
    };

  vi.stubGlobal('localStorage', {
    getItem: record('getItem', (k: string) => held.get(k) ?? null),
    setItem: record('setItem', (k: string, v: string) => void held.set(k, v)),
    removeItem: record('removeItem', (k: string) => void held.delete(k)),
    clear: record('clear', () => held.clear()),
    key: record('key', (i: number) => [...held.keys()][i] ?? null),
  });
}

function makeUploader(overrides: { partSizeBytes?: number; concurrency?: number } = {}) {
  return new MultipartUploader({
    s3: new S3Client({ region: 'us-east-1' }),
    bucket: 'test-bucket',
    key: 'users/alice/big.bin',
    fileName: 'big.bin',
    partSizeBytes: overrides.partSizeBytes ?? 5 * MB,
    concurrency: overrides.concurrency ?? 1,
  });
}

/** A File of exactly `size` bytes, without allocating a UTF-16 string twice its size. */
function makeFile(size: number) {
  return new File([new Uint8Array(size)], 'big.bin');
}

/** One macrotask tick - drains every pending microtask first. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Private field access, mirroring how UploadManager reads `uploader['uploadId']`. */
const uploadIdOf = (u: MultipartUploader) => u['uploadId'];
const controllersOf = (u: MultipartUploader) => u['controllers'];
/** What the uploader is holding in memory to resume from. */
const completedPartsOf = (u: MultipartUploader) => u['completedParts'];

function stubHappyPath() {
  s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
  s3Mock.on(UploadPartCommand).resolves({ ETag: '"etag"' });
  s3Mock.on(CompleteMultipartUploadCommand).resolves({});
  s3Mock.on(AbortMultipartUploadCommand).resolves({});
}

beforeEach(() => {
  s3Mock.reset();
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser storage', () => {
  it('is left alone through a whole upload, start to finish', async () => {
    stubHappyPath();

    await makeUploader().start(makeFile(12 * MB)); // 5 + 5 + 2

    // Three parts used to mean three writes of the file's name and key, with a
    // removal either side.
    expect(storageCalls).toEqual([]);
  });

  it('is left alone when an upload is paused and picked back up', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(ListPartsCommand).resolves({ Parts: [{ ETag: '"etag-1"', PartNumber: 1 }] });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    let paused = false;
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      if (!paused) {
        paused = true;
        uploader.pause();
      }
      return { ETag: '"etag-1"' };
    });
    const file = makeFile(15 * MB);

    await uploader.start(file);
    await uploader.resume(file);

    // The pause is the case the stored state was meant for, and resuming never
    // read it: the uploader already had the upload id and the parts in hand.
    expect(s3Mock).toHaveReceivedCommandTimes(CompleteMultipartUploadCommand, 1);
    expect(storageCalls).toEqual([]);
  });

  it('is left alone when an upload is cancelled', async () => {
    stubHappyPath();
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.cancel();

    expect(storageCalls).toEqual([]);
  });

  it('is left alone when an upload fails', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).rejects(new Error('boom'));

    await expect(makeUploader().start(makeFile(5 * MB))).rejects.toThrow('boom');

    // The path that used to leave an entry behind for good: written as the
    // parts went up, with no success and no cancel to clear it afterwards.
    expect(storageCalls).toEqual([]);
  });

  it('does not need a localStorage to exist at all', async () => {
    // Node, a worker, a browser with storage switched off. The constructor
    // used to reach for it before a single byte had moved.
    vi.unstubAllGlobals();
    expect(typeof localStorage).toBe('undefined');
    stubHappyPath();

    await makeUploader().start(makeFile(5 * MB));

    expect(s3Mock).toHaveReceivedCommandTimes(CompleteMultipartUploadCommand, 1);
  });
});

describe('construction', () => {
  it('takes the part size in bytes', async () => {
    stubHappyPath();

    // The field was called partSizeMB but has always been compared against a
    // byte threshold, so `10` meaning "10 MB" silently became the 5 MiB
    // default. Renaming it is the fix; the unit itself never changed.
    await makeUploader({ partSizeBytes: 10 * MB }).start(makeFile(20 * MB));

    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(2);
  });

  it('clamps a part size below the 5MB minimum', async () => {
    stubHappyPath();

    // 10 bytes is nonsense, and pre-rename this is exactly what `10` meaning
    // "10 MB" resolved to.
    await makeUploader({ partSizeBytes: 10 }).start(makeFile(10 * MB));

    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(2);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
  ])('falls back to a concurrency of 3 for a %s value', async (_label, concurrency) => {
    stubHappyPath();
    let inFlight = 0;
    let peak = 0;
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { ETag: '"e"' };
    });

    await makeUploader({ concurrency }).start(makeFile(30 * MB));

    expect(peak).toBe(3);
  });
});

describe('start', () => {
  it('creates a session, uploads the parts, and completes it', async () => {
    stubHappyPath();

    await makeUploader().start(makeFile(12 * MB));

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(CreateMultipartUploadCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
    });
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3); // 5 + 5 + 2
    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      UploadId: 'upload-1',
    });
  });

  it('reuses an existing session instead of creating a second one', async () => {
    stubHappyPath();
    const uploader = makeUploader();
    uploader['uploadId'] = 'resumed-session';

    await uploader.start(makeFile(5 * MB));

    // A second CreateMultipartUpload would orphan the first session.
    expect(s3Mock).not.toHaveReceivedCommand(CreateMultipartUploadCommand);
    expect(s3Mock).toHaveReceivedCommandWith(UploadPartCommand, {
      UploadId: 'resumed-session',
    });
  });

  it('passes an abort signal with every part so cancel can interrupt it', async () => {
    stubHappyPath();

    await makeUploader().start(makeFile(5 * MB));

    // The stub types `args` as a 1-tuple of the command, but `send` is really
    // called as `send(command, options)` and sinon records both.
    const args = s3Mock.commandCalls(UploadPartCommand)[0]!.args as unknown as [
      unknown,
      { abortSignal?: AbortSignal } | undefined,
    ];
    expect(args[1]?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('releases each part controller once the part settles', async () => {
    stubHappyPath();
    const uploader = makeUploader();

    await uploader.start(makeFile(12 * MB));

    // Holding onto them would leak one AbortController per part for the
    // lifetime of the uploader.
    expect(controllersOf(uploader)).toEqual([]);
  });

  it('completes with parts sorted by number regardless of finish order', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    // Completion order is FORCED with explicit gates rather than staggered
    // timers: a timing race would make the out-of-order premise merely likely,
    // and if it ever stopped holding the test would still pass while silently
    // no longer exercising the sort.
    const release: Array<() => void> = [];
    const started: number[] = [];
    s3Mock.on(UploadPartCommand).callsFake(async (input) => {
      const part = input.PartNumber as number;
      started.push(part);
      await new Promise<void>((resolve) => {
        release[part] = resolve;
      });
      return { ETag: `"etag-${part}"` };
    });

    const uploader = makeUploader({ concurrency: 3 });
    const done = uploader.start(makeFile(15 * MB));
    await vi.waitFor(() => expect(started).toHaveLength(3));

    for (const part of [3, 2, 1]) {
      release[part]!();
      await settle();
    }
    await done;

    // The premise, asserted rather than assumed.
    expect(uploader['completedParts'].map((p) => p.PartNumber)).toEqual([3, 2, 1]);

    // S3 rejects CompleteMultipartUpload if the parts are not in ascending order.
    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      MultipartUpload: {
        Parts: [
          { ETag: '"etag-1"', PartNumber: 1 },
          { ETag: '"etag-2"', PartNumber: 2 },
          { ETag: '"etag-3"', PartNumber: 3 },
        ],
      },
    });
  });

  it('propagates a part failure that is not a pause or cancel', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).rejects(new Error('503 slow down'));

    await expect(makeUploader().start(makeFile(5 * MB))).rejects.toThrow('503 slow down');

    // A silently swallowed failure would complete the upload with missing parts.
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('fails fast when S3 starts a session without returning an UploadId', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({}); // no UploadId
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    await expect(makeUploader().start(makeFile(5 * MB))).rejects.toThrow(
      /did not return an UploadId/
    );

    // Nothing may be sent afterwards. Without the guard the parts went out
    // with UploadId: undefined and completeUpload returned early, so the
    // upload "succeeded" having stored nothing.
    expect(s3Mock).not.toHaveReceivedCommand(UploadPartCommand);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });
});

describe('pause', () => {
  it('stops after the in-flight part and does not complete the upload', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      uploader.pause();
      return { ETag: '"etag-1"' };
    });

    await uploader.start(makeFile(15 * MB));

    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(1);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('keeps what it needs to pick the upload back up', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    const uploader = makeUploader();
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      uploader.pause();
      return { ETag: '"etag-1"' };
    });

    await uploader.start(makeFile(15 * MB));

    // Held on the uploader itself, which is where resume() reads it from. The
    // session is still open on S3, and losing its id would strand the parts
    // already there.
    expect(uploadIdOf(uploader)).toBe('upload-1');
    expect(completedPartsOf(uploader)).toEqual([{ ETag: '"etag-1"', PartNumber: 1 }]);
  });

  it('aborts the controllers of parts still in flight', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    const uploader = makeUploader();
    let signal: AbortSignal | undefined;
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      signal = controllersOf(uploader)[0]?.signal;
      uploader.pause();
      return { ETag: '"e"' };
    });

    await uploader.start(makeFile(15 * MB));

    expect(signal!.aborted).toBe(true);
    expect(controllersOf(uploader)).toEqual([]);
  });

  it('swallows the rejection caused by its own abort', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    const uploader = makeUploader();
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      uploader.pause();
      // A real aborted request surfaces as a rejection.
      throw new Error('Request aborted');
    });

    // Pausing is a user action, not a failure - it must not reject.
    await expect(uploader.start(makeFile(15 * MB))).resolves.toBeUndefined();
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('is harmless when nothing is in flight', () => {
    const uploader = makeUploader();

    expect(() => uploader.pause()).not.toThrow();
    expect(controllersOf(uploader)).toEqual([]);
  });
});

describe('resume', () => {
  it('refuses to resume an upload that was never started', async () => {
    await expect(makeUploader().resume(makeFile(5 * MB))).rejects.toThrow(
      'No uploadId found. Start a new upload.'
    );
  });

  it('asks S3 which parts it already holds', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [] });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.resume(makeFile(5 * MB));

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(ListPartsCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
      UploadId: 'upload-1',
    });
  });

  it('skips re-uploading parts S3 already has', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({
      Parts: [
        { ETag: '"remote-1"', PartNumber: 1 },
        { ETag: '"remote-2"', PartNumber: 2 },
      ],
    });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.resume(makeFile(15 * MB)); // 3 parts total

    // Re-sending bytes S3 already stored is the entire cost resume exists to avoid.
    const uploaded = s3Mock.commandCalls(UploadPartCommand).map((c) => c.args[0].input.PartNumber);
    expect(uploaded).toEqual([3]);
  });

  it('merges local and remote parts, preferring what S3 reports', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [{ ETag: '"remote-1"', PartNumber: 1 }] });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    uploader['completedParts'] = [{ ETag: '"stale-local-1"', PartNumber: 1 }];

    await uploader.resume(makeFile(5 * MB));

    // S3 is the authority on what it actually stored; a stale local ETag would
    // make CompleteMultipartUpload fail with InvalidPart.
    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      MultipartUpload: { Parts: [{ ETag: '"remote-1"', PartNumber: 1 }] },
    });
  });

  it('keeps local parts that S3 has not listed', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [{ ETag: '"remote-2"', PartNumber: 2 }] });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    uploader['completedParts'] = [{ ETag: '"local-1"', PartNumber: 1 }];

    await uploader.resume(makeFile(10 * MB));

    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      MultipartUpload: {
        Parts: [
          { ETag: '"local-1"', PartNumber: 1 },
          { ETag: '"remote-2"', PartNumber: 2 },
        ],
      },
    });
  });

  it('sorts the merged parts even when S3 lists them out of order', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({
      Parts: [
        { ETag: '"remote-3"', PartNumber: 3 },
        { ETag: '"remote-1"', PartNumber: 1 },
        { ETag: '"remote-2"', PartNumber: 2 },
      ],
    });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.resume(makeFile(15 * MB));

    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      MultipartUpload: {
        Parts: [
          { ETag: '"remote-1"', PartNumber: 1 },
          { ETag: '"remote-2"', PartNumber: 2 },
          { ETag: '"remote-3"', PartNumber: 3 },
        ],
      },
    });
  });

  it('ignores a listed part with no part number', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [{ ETag: '"orphan"' }] });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.resume(makeFile(5 * MB));

    // Every field on the SDK's Part type is optional; one without a number
    // cannot be addressed in CompleteMultipartUpload.
    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      MultipartUpload: { Parts: [{ ETag: '"etag"', PartNumber: 1 }] },
    });
  });

  it('treats a missing Parts array as nothing uploaded yet', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({});
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.resume(makeFile(5 * MB));

    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(1);
  });

  it('clears the paused flag so the worker loop runs again', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [] });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    uploader.pause();

    await uploader.resume(makeFile(5 * MB));

    // Without the reset the loop would exit immediately and resume would be a
    // silent no-op.
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(1);
    expect(s3Mock).toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('does not complete when paused again mid-resume', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(ListPartsCommand).resolves({ Parts: [] });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      uploader.pause();
      return { ETag: '"e"' };
    });

    await uploader.resume(makeFile(15 * MB));

    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
    // Still resumable: the session id survives a second pause.
    expect(uploadIdOf(uploader)).toBe('upload-1');
  });

  it('reports progress across parts it did not have to re-upload', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [{ ETag: '"remote-1"', PartNumber: 1 }] });
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    const progress: number[] = [];

    await uploader.resume(makeFile(10 * MB), (p) => progress.push(p));

    // Part 1 was already there, so the first report jumps straight to 100%.
    expect(progress).toEqual([100]);
  });
});

describe('cancel', () => {
  it('aborts the multipart session so no orphaned parts are billed', async () => {
    stubHappyPath();
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.cancel();

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(AbortMultipartUploadCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
      UploadId: 'upload-1',
    });
  });

  it('skips the abort call when no session was ever created', async () => {
    stubHappyPath();

    await makeUploader().cancel();

    // AbortMultipartUpload without an UploadId is a guaranteed 400.
    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);
  });

  it('aborts in-flight part controllers and empties the list', async () => {
    stubHappyPath();
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    const controller = new AbortController();
    uploader['controllers'] = [controller];

    await uploader.cancel();

    expect(controller.signal.aborted).toBe(true);
    expect(controllersOf(uploader)).toEqual([]);
  });

  it('stops the worker loop and never completes the upload', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    s3Mock.on(AbortMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      await uploader.cancel();
      return { ETag: '"e"' };
    });

    await uploader.start(makeFile(15 * MB));

    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(1);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
    expect(s3Mock).toHaveReceivedCommand(AbortMultipartUploadCommand);
  });

  it('swallows the rejection caused by its own abort', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(AbortMultipartUploadCommand).resolves({});
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      await uploader.cancel();
      throw new Error('Request aborted');
    });

    // Cancelling is a user action; surfacing it as an upload error would show
    // the user a failure they deliberately caused.
    await expect(uploader.start(makeFile(15 * MB))).resolves.toBeUndefined();
  });

  it('propagates a failed abort so the caller can report the orphan', async () => {
    stubHappyPath();
    s3Mock.on(AbortMultipartUploadCommand).rejects(new Error('AccessDenied'));
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    // UploadManager.cancelAllUploads relies on this rejecting - a silently
    // failed abort leaves a multipart upload accruing storage charges forever.
    await expect(uploader.cancel()).rejects.toThrow('AccessDenied');
  });

  it('leaves the session id set after cancelling', async () => {
    stubHappyPath();
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await uploader.cancel();

    // Pinning current behaviour: the uploader is single-use after cancel, and
    // calling start() again would resume the aborted session rather than
    // create a fresh one.
    expect(uploadIdOf(uploader)).toBe('upload-1');
  });
});
