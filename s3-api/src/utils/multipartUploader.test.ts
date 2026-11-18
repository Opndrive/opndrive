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

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  MAX_PART_SIZE,
  MAX_PARTS,
  MIN_PART_SIZE,
  MultipartUploader,
  multipartETag,
  partSizeFor,
} from './multipartUploader.js';

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

function makeUploader(
  overrides: { partSizeBytes?: number; concurrency?: number; contentType?: string } = {}
) {
  return new MultipartUploader({
    s3: new S3Client({ region: 'us-east-1' }),
    bucket: 'test-bucket',
    key: 'users/alice/big.bin',
    fileName: 'big.bin',
    partSizeBytes: overrides.partSizeBytes ?? 5 * MB,
    concurrency: overrides.concurrency ?? 1,
    contentType: overrides.contentType,
  });
}

const GiB = 1024 * MB;
const TiB = 1024 * GiB;

/**
 * A stand-in for a file far too large to allocate: it has a size, and slicing
 * it records the byte range asked for and hands back a Blob-shaped object of
 * that size. The S3 client is mocked, so nothing ever reads the bytes.
 */
function hugeFile(size: number) {
  const slices: [number, number][] = [];
  const asFile = {
    name: 'huge.bin',
    size,
    type: '',
    slice: (start: number, end: number) => {
      slices.push([start, end]);
      return { size: end - start } as Blob;
    },
  } as unknown as File;

  return { asFile, slices };
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

/** What S3 answers about a session that has been completed or aborted. */
const noSuchUpload = () =>
  Object.assign(new Error('The specified multipart upload does not exist.'), {
    name: 'NoSuchUpload',
    $metadata: { httpStatusCode: 404 },
  });

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

    await expect(makeUploader().start(makeFile(6 * MB))).rejects.toThrow('boom');

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

    await makeUploader().start(makeFile(6 * MB));

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

  it("clamps a part size above S3's 5 GiB maximum", async () => {
    stubHappyPath();
    const file = hugeFile(20 * GiB);

    // S3 refuses any part over 5 GiB, so asking for 8 GiB parts would fail
    // on the very first one.
    await makeUploader({ partSizeBytes: 8 * GiB }).start(file.asFile);

    expect(file.slices[0]).toEqual([0, 5 * GiB]);
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(4);
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

/**
 * A file that fits in one part goes up as a single PutObject.
 *
 * Empty files are the reason this exists: a multipart upload needs at least one
 * part, an empty file has none, and S3 refuses to complete it. Small files come
 * along because multipart would spend three requests on what one does.
 */
describe('files that fit in one part', () => {
  /** A request that stays open until the uploader aborts it. */
  function heldUntilAborted(uploader: MultipartUploader) {
    const signal = controllersOf(uploader)[0]?.signal;
    return new Promise<never>((_, reject) => {
      const aborted = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (!signal || signal.aborted) return aborted();
      signal.addEventListener('abort', aborted, { once: true });
    });
  }

  it('sends an empty file as one PutObject, with no multipart session', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeUploader().start(makeFile(0));

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
    });
    expect((s3Mock.commandCalls(PutObjectCommand)[0]!.args[0].input.Body as Blob).size).toBe(0);
    expect(s3Mock).not.toHaveReceivedCommand(CreateMultipartUploadCommand);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('sends a file of exactly one part the same way', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeUploader().start(makeFile(5 * MB));

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
    expect(s3Mock).not.toHaveReceivedCommand(CreateMultipartUploadCommand);
  });

  it('switches to multipart one byte past a part', async () => {
    stubHappyPath();

    await makeUploader().start(makeFile(5 * MB + 1));

    expect(s3Mock).not.toHaveReceivedCommand(PutObjectCommand);
    expect(s3Mock).toHaveReceivedCommandTimes(UploadPartCommand, 2);
  });

  it('measures "one part" against the configured part size', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeUploader({ partSizeBytes: 8 * MB }).start(makeFile(8 * MB));

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  it('reports 100% once the file is stored, and not before', async () => {
    const progress: number[] = [];
    s3Mock.on(PutObjectCommand).callsFake(async () => {
      expect(progress).toEqual([]);
      return {};
    });

    await makeUploader().start(makeFile(1024), (p) => progress.push(p));

    expect(progress).toEqual([100]);
  });

  it('propagates a failure', async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error('503 slow down'));

    await expect(makeUploader().start(makeFile(1024))).rejects.toThrow('503 slow down');
  });

  it('passes an abort signal so pause and cancel can interrupt the request', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeUploader().start(makeFile(1024));

    const args = s3Mock.commandCalls(PutObjectCommand)[0]!.args as unknown as [
      unknown,
      { abortSignal?: AbortSignal } | undefined,
    ];
    expect(args[1]?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('pauses by aborting, and sends the whole file again when started again', async () => {
    const uploader = makeUploader();
    const progress: number[] = [];
    let calls = 0;
    s3Mock.on(PutObjectCommand).callsFake(async () => {
      if (++calls === 1) {
        const held = heldUntilAborted(uploader);
        uploader.pause();
        return held;
      }
      return {};
    });

    // A pause is not a failure, so the first attempt resolves quietly.
    await expect(uploader.start(makeFile(1024), (p) => progress.push(p))).resolves.toBeUndefined();
    expect(progress).toEqual([]);

    await uploader.start(makeFile(1024), (p) => progress.push(p));

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 2);
    expect(progress).toEqual([100]);
    expect(controllersOf(uploader)).toEqual([]);
  });

  it('still reports a real failure on the attempt after a pause', async () => {
    const uploader = makeUploader();
    let calls = 0;
    s3Mock.on(PutObjectCommand).callsFake(async () => {
      if (++calls === 1) {
        const held = heldUntilAborted(uploader);
        uploader.pause();
        return held;
      }
      throw new Error('AccessDenied');
    });

    await uploader.start(makeFile(1024));

    // A pause left standing from the first attempt would read this failure as
    // "paused" and resolve, and the upload would be reported as finished.
    await expect(uploader.start(makeFile(1024))).rejects.toThrow('AccessDenied');
  });

  it('can be picked back up with resume() as well', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    // There is no session to resume, so this is a fresh send, not a refusal.
    await makeUploader().resume(makeFile(1024));

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  it('cancels by aborting, with no multipart session to abort', async () => {
    const uploader = makeUploader();
    s3Mock.on(PutObjectCommand).callsFake(async () => {
      const held = heldUntilAborted(uploader);
      void uploader.cancel();
      return held;
    });

    await expect(uploader.start(makeFile(1024))).resolves.toBeUndefined();

    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);
  });

  it('sends nothing once cancelled', async () => {
    const uploader = makeUploader();
    await uploader.cancel();

    await uploader.start(makeFile(1024));

    expect(s3Mock).not.toHaveReceivedCommand(PutObjectCommand);
  });
});

/**
 * Part sizes for large files.
 *
 * Parts used to be 5 MiB whatever the file, and S3 allows at most 10,000 of
 * them, so anything over about 48.8 GiB uploaded for hours and then failed at
 * part 10,001. Large files now get larger parts.
 */
describe('partSizeFor', () => {
  it('keeps the preferred size for every file it can carry', () => {
    expect(partSizeFor(1 * GiB, MIN_PART_SIZE)).toBe(MIN_PART_SIZE);
    // Exactly 10,000 parts of 5 MiB: the largest file 5 MiB parts can hold.
    expect(partSizeFor(MAX_PARTS * MIN_PART_SIZE, MIN_PART_SIZE)).toBe(MIN_PART_SIZE);
  });

  it('grows the part in whole MiB once a file would need more than 10,000', () => {
    // One byte past the limit above.
    expect(partSizeFor(MAX_PARTS * MIN_PART_SIZE + 1, MIN_PART_SIZE)).toBe(6 * MB);
    // 100 GiB over 10,000 parts is 10.24 MiB, so 11 MiB.
    expect(partSizeFor(100 * GiB, MIN_PART_SIZE)).toBe(11 * MB);
  });

  it('keeps a preferred size that is already large enough', () => {
    expect(partSizeFor(100 * GiB, 64 * MB)).toBe(64 * MB);
  });

  it('never needs more than 10,000 parts, at any size up to the limit', () => {
    const sizes = [
      0,
      1,
      48 * GiB,
      49 * GiB,
      60 * GiB,
      512 * GiB,
      1 * TiB,
      5 * TiB,
      20 * TiB,
      MAX_PARTS * MAX_PART_SIZE,
    ];

    for (const size of sizes) {
      const partSize = partSizeFor(size, MIN_PART_SIZE)!;

      expect(partSize, `size ${size}`).toBeGreaterThanOrEqual(MIN_PART_SIZE);
      expect(partSize, `size ${size}`).toBeLessThanOrEqual(MAX_PART_SIZE);
      expect(partSize % MB, `size ${size}`).toBe(0);
      expect(Math.ceil(size / partSize), `size ${size}`).toBeLessThanOrEqual(MAX_PARTS);
    }
  });

  it('gives up past what 10,000 parts of 5 GiB can hold', () => {
    expect(partSizeFor(MAX_PARTS * MAX_PART_SIZE, MIN_PART_SIZE)).toBe(MAX_PART_SIZE);
    expect(partSizeFor(MAX_PARTS * MAX_PART_SIZE + 1, MIN_PART_SIZE)).toBeNull();
  });
});

describe('very large files', () => {
  /** Every UploadPart sent so far, as [part number, bytes]. */
  const partsSent = (slices: [number, number][]) =>
    s3Mock
      .commandCalls(UploadPartCommand)
      .map((call, i) => [call.args[0].input.PartNumber!, slices[i]![1] - slices[i]![0]]);

  it('uploads a 60 GiB file in under 10,000 parts', async () => {
    stubHappyPath();
    const file = hugeFile(60 * GiB);

    await makeUploader().start(file.asFile);

    // 60 GiB over 10,000 parts is 6.14 MiB, so 7 MiB parts: 8,778 of them.
    const sent = partsSent(file.slices);
    expect(sent).toHaveLength(8778);
    expect(Math.max(...sent.map(([number]) => number))).toBe(8778);
    expect(sent.slice(0, -1).every(([, bytes]) => bytes === 7 * MB)).toBe(true);
    expect(sent.reduce((total, [, bytes]) => total + bytes, 0)).toBe(60 * GiB);

    const completed = s3Mock.commandCalls(CompleteMultipartUploadCommand)[0]!.args[0].input;
    expect(completed.MultipartUpload!.Parts).toHaveLength(8778);
  });

  it('resumes with the same part boundaries it started with', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    const file = hugeFile(60 * GiB);
    let calls = 0;
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      if (++calls === 2) uploader.pause();
      return { ETag: '"e"' };
    });
    await uploader.start(file.asFile);
    s3Mock.on(ListPartsCommand).resolves({
      Parts: [
        { PartNumber: 1, ETag: '"e"' },
        { PartNumber: 2, ETag: '"e"' },
      ],
    });

    await uploader.resume(file.asFile);

    // Part 3 starts exactly where part 2 ended. A resume that worked the part
    // size out differently would cut the file in different places and stitch
    // two incompatible halves together.
    expect(file.slices[2]).toEqual([2 * 7 * MB, 3 * 7 * MB]);
    expect(s3Mock).toHaveReceivedCommandTimes(UploadPartCommand, 8778);
  });

  it('refuses a file no part size could carry, before creating anything', async () => {
    const file = hugeFile(MAX_PARTS * MAX_PART_SIZE + 1);

    await expect(makeUploader().start(file.asFile)).rejects.toThrow(/too large to upload/);

    // Refused up front. Failing at part 10,001 instead would leave every part
    // before it stored, billed and invisible.
    expect(s3Mock).not.toHaveReceivedAnyCommand();
  });

  it('names the file and the limit when it refuses', async () => {
    const file = hugeFile(49 * TiB);

    await expect(makeUploader().start(file.asFile)).rejects.toThrow(
      'big.bin is too large to upload. A multipart upload can have at most 10,000 parts'
    );
  });
});

/**
 * The Content-Type the object is stored with.
 *
 * Uploads used to send none, so S3 stored every file as binary/octet-stream:
 * a photo, a video and a PDF all came back as "some bytes" to anything that
 * read the object without the app's own preview overriding the type.
 */
describe('content type', () => {
  const typed = (size: number, name: string, type: string) =>
    new File([new Uint8Array(size)], name, { type });

  it("sends the file's type with a single request", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeUploader().start(typed(1024, 'photo.png', 'image/png'));

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, { ContentType: 'image/png' });
  });

  it('sends it when a multipart upload is created', async () => {
    stubHappyPath();

    await makeUploader().start(typed(12 * MB, 'clip.mp4', 'video/mp4'));

    // The parts and the completion carry no type. This is the only request
    // that can set it.
    expect(s3Mock).toHaveReceivedCommandWith(CreateMultipartUploadCommand, {
      ContentType: 'video/mp4',
    });
  });

  it('uses the type it was given when the browser has none', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    // An iPhone photo on Windows: the browser often reports no type for it.
    await makeUploader({ contentType: 'image/heic' }).start(typed(1024, 'IMG_0001.HEIC', ''));

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, { ContentType: 'image/heic' });
  });

  it('prefers the type it was given over the browser one', async () => {
    stubHappyPath();

    await makeUploader({ contentType: 'text/csv' }).start(
      typed(12 * MB, 'export.csv', 'application/vnd.ms-excel')
    );

    expect(s3Mock).toHaveReceivedCommandWith(CreateMultipartUploadCommand, {
      ContentType: 'text/csv',
    });
  });

  it('sends none when nobody knows, leaving S3 to its default', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeUploader().start(makeFile(1024));

    expect(s3Mock.commandCalls(PutObjectCommand)[0]!.args[0].input.ContentType).toBeUndefined();
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

  it('is not held back by a pause from an attempt that has already ended', async () => {
    // A first attempt fails before its session opens, offline say, and the
    // upload is paused and resumed while it waits to retry. The pause belongs
    // to that attempt. Carried into this one, it skipped every part and the
    // completion, and start() resolved as if the file had been stored.
    stubHappyPath();
    const uploader = makeUploader();
    uploader.pause();

    await uploader.start(makeFile(12 * MB));

    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3);
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

    await makeUploader().start(makeFile(6 * MB));

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

    await expect(makeUploader().start(makeFile(6 * MB))).rejects.toThrow('503 slow down');

    // A silently swallowed failure would complete the upload with missing parts.
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('fails fast when S3 starts a session without returning an UploadId', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({}); // no UploadId
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    await expect(makeUploader().start(makeFile(6 * MB))).rejects.toThrow(
      /did not return an UploadId/
    );

    // Nothing may be sent afterwards. Without the guard the parts went out
    // with UploadId: undefined and completeUpload returned early, so the
    // upload "succeeded" having stored nothing.
    expect(s3Mock).not.toHaveReceivedCommand(UploadPartCommand);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });
});

/**
 * One part failing.
 *
 * It used to reject start() at once while the other workers carried on, so an
 * upload already reported as failed went on sending every part it had left,
 * to a session nothing would ever complete.
 */
describe('a part that fails', () => {
  /** The abort signal of the part currently being sent with this number. */
  function signalOf(uploader: MultipartUploader) {
    return controllersOf(uploader)[controllersOf(uploader).length - 1]!.signal;
  }

  /**
   * Part 1 fails once parts 2 and 3 are on the wire; those two stay open
   * until aborted. Six parts in all, three at a time.
   */
  function failFirstPartWhileOthersAreInFlight(uploader: MultipartUploader) {
    const inFlight: AbortSignal[] = [];
    let release!: () => void;
    const othersStarted = new Promise<void>((resolve) => (release = resolve));

    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    s3Mock.on(UploadPartCommand).callsFake(async (input: { PartNumber?: number }) => {
      if (input.PartNumber === 1) {
        await othersStarted;
        throw new Error('connection reset');
      }

      const signal = signalOf(uploader);
      inFlight.push(signal);
      if (inFlight.length === 2) release();

      return new Promise((_, reject) => {
        const aborted = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal.aborted) return aborted();
        signal.addEventListener('abort', aborted, { once: true });
      });
    });

    return inFlight;
  }

  it("rejects with that part's error", async () => {
    const uploader = makeUploader({ concurrency: 3 });
    failFirstPartWhileOthersAreInFlight(uploader);

    // Not the "aborted" the other parts end with: that is our doing.
    await expect(uploader.start(makeFile(30 * MB))).rejects.toThrow('connection reset');
  });

  it('stops the other parts instead of sending the rest', async () => {
    const uploader = makeUploader({ concurrency: 3 });
    const inFlight = failFirstPartWhileOthersAreInFlight(uploader);

    await uploader.start(makeFile(30 * MB)).catch(() => {});

    // The two already on the wire are aborted, and parts 4 to 6 never go.
    expect(inFlight.every((signal) => signal.aborted)).toBe(true);
    expect(s3Mock).toHaveReceivedCommandTimes(UploadPartCommand, 3);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
  });

  it('has nothing left in flight by the time it rejects', async () => {
    const uploader = makeUploader({ concurrency: 3 });
    failFirstPartWhileOthersAreInFlight(uploader);

    await uploader.start(makeFile(30 * MB)).catch(() => {});

    expect(controllersOf(uploader)).toEqual([]);
  });

  it('keeps the session, so the caller can still resume', async () => {
    const uploader = makeUploader({ concurrency: 3 });
    failFirstPartWhileOthersAreInFlight(uploader);
    await uploader.start(makeFile(30 * MB)).catch(() => {});

    s3Mock.on(UploadPartCommand).resolves({ ETag: '"etag"' });
    s3Mock.on(ListPartsCommand).resolves({ Parts: [] });
    await uploader.resume(makeFile(30 * MB));

    // Aborting a failed upload is the caller's choice: UploadManager makes it,
    // because it never resumes one. The uploader does not decide for everyone.
    expect(uploadIdOf(uploader)).toBe('upload-1');
    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);
    expect(s3Mock).toHaveReceivedCommandTimes(CompleteMultipartUploadCommand, 1);
  });

  it('still lets a pause win over a failure that follows it', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    const uploader = makeUploader();
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      uploader.pause();
      throw new Error('connection reset');
    });

    // A paused upload is not a failed one, whatever its last request did.
    await expect(uploader.start(makeFile(15 * MB))).resolves.toBeUndefined();
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
    await expect(makeUploader().resume(makeFile(6 * MB))).rejects.toThrow(
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

/**
 * A request held open until the test answers it, the way a slow server holds
 * one. Each call gets its own; `answer` settles the oldest still waiting.
 */
function heldRequests<T>() {
  const waiting: { resolve: (value: T) => void; reject: (error: unknown) => void }[] = [];
  return {
    fake: () => new Promise<T>((resolve, reject) => waiting.push({ resolve, reject })),
    answer: (value: T) => waiting.shift()!.resolve(value),
    fail: (error: unknown) => waiting.shift()!.reject(error),
    get count() {
      return waiting.length;
    },
  };
}

describe('one run at a time', () => {
  // Pausing aborts every part in flight, but three requests cannot be aborted
  // part way: opening the session, listing its parts, and completing it. A
  // pause and resume while one of them was out used to start a second run
  // beside the first, both driving the same uploader.

  it('waits for a session still opening, rather than opening a second one', async () => {
    const create = heldRequests<{ UploadId: string }>();
    s3Mock.on(CreateMultipartUploadCommand).callsFake(create.fake);
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();

    const first = uploader.start(makeFile(15 * MB));
    await settle();
    uploader.pause();
    // What UploadManager does on resume: the session has not opened, so it
    // asks for a fresh start.
    const second = uploader.start(makeFile(15 * MB));
    await settle();

    // Only the first run's request is out; the second is waiting its turn.
    expect(create.count).toBe(1);
    create.answer({ UploadId: 'upload-1' });
    await Promise.all([first, second]);

    expect(s3Mock.commandCalls(CreateMultipartUploadCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3);
    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(CompleteMultipartUploadCommand, {
      UploadId: 'upload-1',
    });
  });

  it('sends each part once when paused and resumed while listing parts', async () => {
    const list = heldRequests<{ Parts: [] }>();
    s3Mock.on(ListPartsCommand).callsFake(list.fake);
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    const first = uploader.resume(makeFile(15 * MB));
    await settle();
    uploader.pause();
    const second = uploader.resume(makeFile(15 * MB));
    await settle();

    list.answer({ Parts: [] });
    await settle();
    // The second run lists the parts for itself once the first has stopped.
    list.answer({ Parts: [] });
    await Promise.all([first, second]);

    const sent = s3Mock.commandCalls(UploadPartCommand).map((c) => c.args[0].input.PartNumber);
    expect(sent).toEqual([1, 2, 3]);
    expect(s3Mock.commandCalls(CompleteMultipartUploadCommand)).toHaveLength(1);
  });

  it('finishes, without asking about the session again, when paused while completing', async () => {
    // Asked about after it has completed, the session is gone, and S3 answers
    // NoSuchUpload: the resumed run used to list its parts and fail.
    const complete = heldRequests<object>();
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).callsFake(complete.fake);
    s3Mock.on(ListPartsCommand).rejects(noSuchUpload());
    const uploader = makeUploader();

    const first = uploader.start(makeFile(15 * MB));
    while (complete.count === 0) await settle();
    uploader.pause();
    const second = uploader.resume(makeFile(15 * MB));
    await settle();

    complete.answer({});
    await expect(Promise.all([first, second])).resolves.toBeDefined();

    expect(s3Mock).not.toHaveReceivedCommand(ListPartsCommand);
    expect(s3Mock.commandCalls(CompleteMultipartUploadCommand)).toHaveLength(1);
  });

  it('does nothing at all for a run paused before its turn came', async () => {
    const create = heldRequests<{ UploadId: string }>();
    s3Mock.on(CreateMultipartUploadCommand).callsFake(create.fake);
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const uploader = makeUploader();

    const first = uploader.start(makeFile(15 * MB));
    await settle();
    uploader.pause();
    const second = uploader.start(makeFile(15 * MB));
    uploader.pause();
    create.answer({ UploadId: 'upload-1' });
    await Promise.all([first, second]);

    // Paused, and still paused: nothing went up, and the session is kept.
    expect(s3Mock).not.toHaveReceivedCommand(UploadPartCommand);
    expect(s3Mock).not.toHaveReceivedCommand(CompleteMultipartUploadCommand);
    expect(uploadIdOf(uploader)).toBe('upload-1');
  });

  it('aborts a session that opens after the upload was cancelled', async () => {
    // cancel() found no session to abort, because it had not opened yet.
    // Left alone, it stayed open on the server for good, billing its parts.
    const create = heldRequests<{ UploadId: string }>();
    s3Mock.on(CreateMultipartUploadCommand).callsFake(create.fake);
    s3Mock.on(AbortMultipartUploadCommand).resolves({});
    const uploader = makeUploader();

    const run = uploader.start(makeFile(15 * MB));
    await settle();
    await uploader.cancel();
    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);

    create.answer({ UploadId: 'upload-1' });
    await run;

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(AbortMultipartUploadCommand, {
      UploadId: 'upload-1',
    });
    expect(s3Mock).not.toHaveReceivedCommand(UploadPartCommand);
  });

  it('does not abort a session that is already complete when cancelled', async () => {
    stubHappyPath();
    const uploader = makeUploader();
    await uploader.start(makeFile(15 * MB));

    await uploader.cancel();

    // The object is stored; there is no session left to abort, and asking
    // would only bring back NoSuchUpload.
    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);
  });
});

/** A part's ETag as S3 gives it: the part's MD5, in quotes. */
const partETag = (seed: string) => `"${createHash('md5').update(seed).digest('hex')}"`;

/**
 * What S3 stores a multipart object under, worked out with Node's own MD5 so
 * the test does not lean on the code under test.
 */
function storedETag(etags: string[]) {
  const digests = Buffer.concat(etags.map((etag) => Buffer.from(etag.slice(1, -1), 'hex')));
  return `"${createHash('md5').update(digests).digest('hex')}-${etags.length}"`;
}

/** An error with no HTTP status, as a dropped connection produces. */
const dropped = () => Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });

describe('multipartETag', () => {
  it("is S3's ETag for an object made of these parts", () => {
    const etags = [partETag('one'), partETag('two'), partETag('three')];
    const parts = etags.map((ETag, index) => ({ ETag, PartNumber: index + 1 }));

    expect(`"${multipartETag(parts)}"`).toBe(storedETag(etags));
  });

  it('reads ETags with or without quotes, in either case', () => {
    const etag = partETag('one');
    const bare = etag.slice(1, -1).toUpperCase();

    expect(multipartETag([{ ETag: bare, PartNumber: 1 }])).toBe(
      multipartETag([{ ETag: etag, PartNumber: 1 }])
    );
  });

  it('gives up on a part ETag that is not an MD5, as with SSE-KMS', () => {
    expect(multipartETag([{ ETag: '"not-an-md5"', PartNumber: 1 }])).toBeNull();
    expect(multipartETag([{ PartNumber: 1 }])).toBeNull();
  });
});

describe('a completion whose answer was lost', () => {
  // S3 can store the object and the reply never arrive. Asked again, it says
  // the session does not exist (NoSuchUpload), which is also what it says
  // when a session was aborted. The upload used to resume, list the parts of
  // that session, get NoSuchUpload, and fail, over a file that was stored.
  const etags = [partETag('one'), partETag('two'), partETag('three')];

  function stubParts() {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    for (const [index, ETag] of etags.entries()) {
      s3Mock.on(UploadPartCommand, { PartNumber: index + 1 }).resolves({ ETag });
    }
    s3Mock.on(ListPartsCommand).rejects(noSuchUpload());
    s3Mock.on(AbortMultipartUploadCommand).resolves({});
  }

  /** Started, with its completion stored by S3 but the reply lost. */
  async function completedWithoutAnswer() {
    stubParts();
    s3Mock.on(CompleteMultipartUploadCommand).rejectsOnce(dropped()).rejects(noSuchUpload());
    const uploader = makeUploader();
    await expect(uploader.start(makeFile(15 * MB))).rejects.toThrow('Failed to fetch');
    return uploader;
  }

  it('is finished when the stored object is the one its parts make', async () => {
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag(etags) });

    // What UploadManager does next: the session is open, so it resumes.
    await expect(uploader.resume(makeFile(15 * MB))).resolves.toBeUndefined();

    // Asked again, not resumed: listing the parts is what failed it.
    expect(s3Mock).not.toHaveReceivedCommand(ListPartsCommand);
    expect(s3Mock.commandCalls(CompleteMultipartUploadCommand)).toHaveLength(2);
    expect(s3Mock).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
    });
  });

  it('is finished the same way after a start, which does not list parts', async () => {
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag(etags) });

    await expect(uploader.start(makeFile(15 * MB))).resolves.toBeUndefined();
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3);
  });

  it('is finished when NoSuchUpload comes back from the first completion', async () => {
    // The AWS SDK retries a dropped request by itself, so the first answer
    // this code sees can already be the NoSuchUpload of the second try.
    stubParts();
    s3Mock.on(CompleteMultipartUploadCommand).rejects(noSuchUpload());
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag(etags) });

    await expect(makeUploader().start(makeFile(15 * MB))).resolves.toBeUndefined();
  });

  it('does nothing more once finished, and is not aborted by a late cancel', async () => {
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag(etags) });
    await uploader.resume(makeFile(15 * MB));
    s3Mock.resetHistory();

    await uploader.resume(makeFile(15 * MB));
    await uploader.cancel();

    expect(s3Mock.calls()).toHaveLength(0);
  });

  it('fails, saying so, when nothing was stored', async () => {
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).rejects(
      Object.assign(new Error('NotFound'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })
    );

    await expect(uploader.resume(makeFile(15 * MB))).rejects.toThrow(
      '"big.bin" was not stored: its upload was ended on the server before it was finished. Upload it again.'
    );
  });

  it('fails when the object there now is a different one', async () => {
    // Written by someone else since, or an older copy under the same name:
    // either way not this upload, and "done" would be a lie.
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag([partETag('other')]) });

    await expect(uploader.resume(makeFile(15 * MB))).rejects.toThrow(
      /^Could not confirm that "big\.bin" was stored/
    );
  });

  it('fails when its parts cannot say what the object should be', async () => {
    // Under SSE-KMS a part's ETag is not its MD5, so there is nothing to
    // match the stored object against.
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"kms-opaque-etag"' });
    s3Mock.on(CompleteMultipartUploadCommand).rejects(noSuchUpload());
    s3Mock.on(HeadObjectCommand).resolves({ ETag: '"kms-opaque-object-etag"' });

    await expect(makeUploader().start(makeFile(15 * MB))).rejects.toThrow(
      /^Could not confirm that "big\.bin" was stored/
    );
  });

  it('stays in doubt while the check itself gets no answer', async () => {
    const uploader = await completedWithoutAnswer();
    s3Mock
      .on(HeadObjectCommand)
      .rejectsOnce(dropped())
      .resolves({ ETag: storedETag(etags) });

    // The network is still down: that error, which is worth retrying.
    await expect(uploader.resume(makeFile(15 * MB))).rejects.toThrow('Failed to fetch');
    // And the next try settles it.
    await expect(uploader.resume(makeFile(15 * MB))).resolves.toBeUndefined();
    expect(s3Mock).not.toHaveReceivedCommand(ListPartsCommand);
  });

  it('counts a 5xx as no answer too', async () => {
    stubParts();
    s3Mock
      .on(CompleteMultipartUploadCommand)
      .rejectsOnce(
        Object.assign(new Error('We encountered an internal error.'), {
          name: 'InternalError',
          $metadata: { httpStatusCode: 500 },
        })
      )
      .rejects(noSuchUpload());
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag(etags) });
    const uploader = makeUploader();
    await expect(uploader.start(makeFile(15 * MB))).rejects.toThrow('internal error');

    await expect(uploader.resume(makeFile(15 * MB))).resolves.toBeUndefined();
    expect(s3Mock).not.toHaveReceivedCommand(ListPartsCommand);
  });

  it('resumes as usual after a completion S3 refused outright', async () => {
    // A 4xx is an answer: the session is still there, and listing its parts
    // is how a resume puts the refusal right.
    stubParts();
    s3Mock
      .on(CompleteMultipartUploadCommand)
      .rejectsOnce(
        Object.assign(new Error('One or more of the specified parts could not be found.'), {
          name: 'InvalidPart',
          $metadata: { httpStatusCode: 400 },
        })
      )
      .resolves({});
    s3Mock.on(ListPartsCommand).resolves({
      Parts: etags.map((ETag, index) => ({ ETag, PartNumber: index + 1 })),
    });
    const uploader = makeUploader();
    await expect(uploader.start(makeFile(15 * MB))).rejects.toThrow('could not be found');

    await uploader.resume(makeFile(15 * MB));

    expect(s3Mock).toHaveReceivedCommand(ListPartsCommand);
    expect(s3Mock).not.toHaveReceivedCommand(HeadObjectCommand);
  });

  it('starts afresh once S3 has said the file is not there', async () => {
    // A definite answer, not a doubt: asked again, it would only send the
    // completion and look at the object again, for the same answer.
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).rejects(
      Object.assign(new Error('NotFound'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })
    );
    await expect(uploader.resume(makeFile(15 * MB))).rejects.toThrow('was not stored');
    s3Mock.resetHistory();
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-2' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    await uploader.start(makeFile(15 * MB));

    expect(s3Mock).toHaveReceivedCommandTimes(CreateMultipartUploadCommand, 1);
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3);
    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      UploadId: 'upload-2',
    });
  });

  it('has no session left to abort once S3 has said so', async () => {
    const uploader = await completedWithoutAnswer();
    s3Mock.on(HeadObjectCommand).resolves({ ETag: storedETag([partETag('other')]) });
    await expect(uploader.resume(makeFile(15 * MB))).rejects.toThrow('Could not confirm');
    s3Mock.resetHistory();

    await uploader.cancel();

    expect(s3Mock).not.toHaveReceivedCommand(AbortMultipartUploadCommand);
  });
});

/**
 * A request that answers only when aborted, the way one on a half-open
 * connection never answers at all. Its abort signal is the uploader's newest
 * controller, made just before the request is sent.
 */
function hangsUntilAborted(uploader: MultipartUploader) {
  return () => {
    const controllers = controllersOf(uploader);
    const signal = controllers[controllers.length - 1]!.signal;
    return new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' }))
      )
    );
  };
}

describe('a request that hangs', () => {
  // Opening the session, listing its parts and completing it could not be
  // aborted, so a pause left the run waiting on them, and with one run at a
  // time, the resume waited behind it: on a connection that never answered,
  // for good.

  it('is aborted by a pause while the session opens, and the resume goes ahead', async () => {
    const uploader = makeUploader();
    // Chained: a second on() for the same command would replace the first.
    s3Mock
      .on(CreateMultipartUploadCommand)
      .callsFakeOnce(hangsUntilAborted(uploader))
      .resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    const first = uploader.start(makeFile(15 * MB));
    await settle();
    uploader.pause();
    const second = uploader.start(makeFile(15 * MB));

    // Paused, which is no failure; and then finished.
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3);
    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(CompleteMultipartUploadCommand, {
      UploadId: 'upload-1',
    });
  });

  it('is aborted by a pause while listing parts', async () => {
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';
    s3Mock.on(ListPartsCommand).callsFakeOnce(hangsUntilAborted(uploader)).resolves({ Parts: [] });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    const first = uploader.resume(makeFile(15 * MB));
    await settle();
    uploader.pause();

    await expect(first).resolves.toBeUndefined();
    await expect(uploader.resume(makeFile(15 * MB))).resolves.toBeUndefined();
    expect(s3Mock).toHaveReceivedCommandTimes(CompleteMultipartUploadCommand, 1);
  });

  it('is aborted by a pause while completing, and the resume settles the completion', async () => {
    // Aborted, the completion may or may not have been acted on, which is a
    // completion in doubt: asked again, not resumed.
    const uploader = makeUploader();
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock
      .on(CompleteMultipartUploadCommand)
      .callsFakeOnce(hangsUntilAborted(uploader))
      .resolves({});

    const first = uploader.start(makeFile(15 * MB));
    while (s3Mock.commandCalls(CompleteMultipartUploadCommand).length === 0) await settle();
    uploader.pause();

    await expect(first).resolves.toBeUndefined();
    await expect(uploader.resume(makeFile(15 * MB))).resolves.toBeUndefined();
    expect(s3Mock).not.toHaveReceivedCommand(ListPartsCommand);
    expect(s3Mock).toHaveReceivedCommandTimes(CompleteMultipartUploadCommand, 2);
  });

  it('gives opening, listing and completing an abort signal, like a part', async () => {
    stubHappyPath();
    s3Mock.on(ListPartsCommand).resolves({ Parts: [] });
    const uploader = makeUploader();
    await uploader.start(makeFile(15 * MB));
    const resumed = makeUploader();
    resumed['uploadId'] = 'upload-1';
    await resumed.resume(makeFile(5 * MB));

    const sent = [
      s3Mock.commandCalls(CreateMultipartUploadCommand)[0]!.args,
      s3Mock.commandCalls(ListPartsCommand)[0]!.args,
      s3Mock.commandCalls(CompleteMultipartUploadCommand)[0]!.args,
    ] as unknown as [unknown, { abortSignal?: AbortSignal }?][];
    for (const args of sent) expect(args[1]?.abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('while completing', () => {
  it('says so, for as long as the completion is on the wire', async () => {
    // Once S3 has been asked to finish, a cancel cannot stop it storing the
    // file. UploadManager reads this to let the upload finish instead.
    const complete = heldRequests<object>();
    stubHappyPath();
    s3Mock.on(CompleteMultipartUploadCommand).callsFake(complete.fake);
    const uploader = makeUploader();

    expect(uploader.isCompleting).toBe(false);
    const run = uploader.start(makeFile(15 * MB));
    while (complete.count === 0) await settle();
    expect(uploader.isCompleting).toBe(true);

    complete.answer({});
    await run;
    expect(uploader.isCompleting).toBe(false);
  });

  it('reports a cancel that came too late, rather than calling it clean', async () => {
    // Cancelled with the completion in doubt, the abort finds no session:
    // the completion most likely stored the file. Swallowed, the upload
    // looked cancelled with the file in the bucket.
    const uploader = await (async () => {
      s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
      s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
      s3Mock.on(CompleteMultipartUploadCommand).rejects(dropped());
      const u = makeUploader();
      await expect(u.start(makeFile(15 * MB))).rejects.toThrow('Failed to fetch');
      return u;
    })();
    s3Mock.on(AbortMultipartUploadCommand).rejects(noSuchUpload());

    await expect(uploader.cancel()).rejects.toThrow(
      '"big.bin" may already be stored: it was being finished when it was cancelled.'
    );
  });
});

describe('the part that failed', () => {
  it('is named after a failed attempt, for UploadManager to tell a stuck part from a blip', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(UploadPartCommand, { PartNumber: 2 }).rejects(dropped());
    const uploader = makeUploader();

    expect(uploader.failedPart).toBeUndefined();
    await expect(uploader.start(makeFile(15 * MB))).rejects.toThrow('Failed to fetch');

    expect(uploader.failedPart).toBe(2);
  });

  it('is forgotten when the next attempt fails some other way', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(UploadPartCommand, { PartNumber: 2 }).rejectsOnce(dropped());
    s3Mock.on(ListPartsCommand).rejects(dropped());
    const uploader = makeUploader();
    await expect(uploader.start(makeFile(15 * MB))).rejects.toThrow();

    await expect(uploader.resume(makeFile(15 * MB))).rejects.toThrow();

    expect(uploader.failedPart).toBeUndefined();
  });
});

describe('cancel', () => {
  it('treats a session that is already gone as aborted', async () => {
    // What abort is for has happened already. UploadManager aborts every
    // failed upload, and logged this as parts possibly left in the bucket.
    stubHappyPath();
    s3Mock.on(AbortMultipartUploadCommand).rejects(noSuchUpload());
    const uploader = makeUploader();
    uploader['uploadId'] = 'upload-1';

    await expect(uploader.cancel()).resolves.toBeUndefined();
  });

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
