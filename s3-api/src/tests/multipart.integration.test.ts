/**
 * Multipart uploads against a real S3-compatible server.
 *
 * The unit suites mock the S3 client, and a mock accepts whatever it is sent.
 * That is how three upload bugs shipped with every test green: a mock happily
 * completes a multipart upload with no parts (S3 refuses), never notices a
 * missing Content-Type, and does not care how many parts a file needs. These
 * tests send the real requests to a real server and read the result back.
 *
 * They skip themselves unless a server is configured, so CI and anyone without
 * one are unaffected. To run them against a local MinIO:
 *
 *   S3_IT_ENDPOINT=http://localhost:19000 S3_IT_ACCESS_KEY_ID=... \
 *   S3_IT_SECRET_ACCESS_KEY=... pnpm vitest run src/tests/multipart.integration.test.ts
 *
 * S3_IT_BUCKET (default `opndrive-integration`) is created if it is missing.
 * Everything a run writes goes under its own prefix and is removed afterwards.
 */

import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { MultipartUploader } from '../utils/multipartUploader.js';
import { UploadManager } from '../utils/uploadManager.js';
import { copyObject } from '../utils/copyObject.js';
import type { EventPayload } from '../core/types.js';

const ENDPOINT = process.env.S3_IT_ENDPOINT;
const ACCESS_KEY_ID = process.env.S3_IT_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_IT_SECRET_ACCESS_KEY;
const BUCKET = process.env.S3_IT_BUCKET || 'opndrive-integration';
const REGION = process.env.S3_IT_REGION || 'us-east-1';

const configured = Boolean(ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
const describeIfConfigured = configured ? describe : describe.skip;

const MiB = 1024 * 1024;

/** Everything this run writes lives under here, so cleanup cannot touch anything else. */
const RUN_PREFIX = `integration/${Date.now()}-${randomBytes(3).toString('hex')}/`;

/**
 * Configured the way BaseS3ApiProvider configures it, except for the request
 * handler. Node's default handler refuses a Blob body, which is what the
 * uploader sends. The fetch handler is the one the SDK uses in a browser, and
 * Node has fetch built in, so this is the browser's request path.
 */
const client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY_ID ?? '', secretAccessKey: SECRET_ACCESS_KEY ?? '' },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  requestHandler: new FetchHttpHandler(),
});

let keySeq = 0;
const keyFor = (name: string) => `${RUN_PREFIX}${++keySeq}-${name}`;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function head(key: string) {
  return client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function readBack(key: string): Promise<Uint8Array> {
  const { Body } = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Body!.transformToByteArray();
}

async function openUploadsFor(key: string) {
  const { Uploads } = await client.send(
    new ListMultipartUploadsCommand({ Bucket: BUCKET, Prefix: key })
  );
  return Uploads ?? [];
}

type Send = S3Client['send'];

/**
 * The real client, with a hook in front of every request.
 *
 * The hook can stand in for one request (to fail it, or hold it open) and
 * otherwise passes it straight through, so everything else really happens.
 */
function interceptedClient(
  hook: (command: unknown, options?: { abortSignal?: AbortSignal }) => Promise<unknown> | undefined
) {
  const sent: string[] = [];
  const send = (async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
    sent.push((command as object).constructor.name);
    const replaced = hook(command, options);
    if (replaced) return replaced;
    return (client.send as (c: unknown, o?: unknown) => Promise<unknown>)(command, options);
  }) as unknown as Send;

  return { s3: { send } as unknown as S3Client, sent };
}

/** A request that never answers until it is aborted, like a part still on the wire. */
function heldUntilAborted(signal?: AbortSignal): Promise<never> {
  const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

  return new Promise((_, reject) => {
    // Already aborted counts too: 'abort' fires once, and a listener added
    // after it would wait forever.
    if (signal?.aborted) return reject(aborted());
    signal?.addEventListener('abort', () => reject(aborted()), { once: true });
  });
}

function uploader(key: string, s3: S3Client = client, extra: Record<string, unknown> = {}) {
  return new MultipartUploader({
    s3,
    bucket: BUCKET,
    key,
    fileName: key.split('/').pop()!,
    partSizeBytes: 5 * MiB,
    concurrency: 2,
    ...extra,
  });
}

function waitForStatus(manager: UploadManager, id: string, status: string, timeoutMs = 30_000) {
  return new Promise<EventPayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${status}`)), timeoutMs);
    const listener = (payload: EventPayload) => {
      if (payload.id !== id || payload.status !== status) return;
      clearTimeout(timer);
      manager.off('statusChange', listener);
      resolve(payload);
    };
    manager.on('statusChange', listener);
  });
}

// Real uploads of a few tens of MiB. Quick against a local server, but not
// within the 5 second default on a slow one.
describeIfConfigured('multipart uploads against a real S3 server', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    try {
      await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    }
  });

  afterEach(async () => {
    await UploadManager.disposeInstance();
  });

  afterAll(async () => {
    // Objects first, then anything a test left open.
    const { Contents } = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: RUN_PREFIX })
    );
    if (Contents?.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: Contents.map((o) => ({ Key: o.Key! })), Quiet: true },
        })
      );
    }
    for (const upload of await openUploadsFor(RUN_PREFIX)) {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: BUCKET,
          Key: upload.Key!,
          UploadId: upload.UploadId!,
        })
      );
    }
  });

  describe('empty files', () => {
    it('stores an empty file', async () => {
      const key = keyFor('__init__.py');

      await uploader(key).start(new File([], '__init__.py'));

      expect((await head(key)).ContentLength).toBe(0);
    });

    it('leaves no multipart upload open behind it', async () => {
      const key = keyFor('.gitkeep');

      await uploader(key).start(new File([], '.gitkeep'));

      expect(await openUploadsFor(key)).toEqual([]);
    });
  });

  describe('small files', () => {
    it('go up in a single request', async () => {
      const key = keyFor('notes.txt');
      const { s3, sent } = interceptedClient(() => undefined);

      await uploader(key, s3).start(new File(['hello from opndrive'], 'notes.txt'));

      expect(sent).toEqual(['PutObjectCommand']);
      expect(new TextDecoder().decode(await readBack(key))).toBe('hello from opndrive');
    });

    it('can be paused and picked back up', async () => {
      const key = keyFor('paused.txt');
      let held = true;
      const { s3 } = interceptedClient((command, options) =>
        command instanceof PutObjectCommand && held
          ? heldUntilAborted(options?.abortSignal)
          : undefined
      );
      const file = new File(['picked back up'], 'paused.txt');
      const up = uploader(key, s3);

      const first = up.start(file);
      up.pause();
      await first;
      held = false;

      // What UploadManager does on resume for an upload with no multipart id.
      await up.start(file);

      expect(new TextDecoder().decode(await readBack(key))).toBe('picked back up');
    });
  });

  describe('content type', () => {
    it('is recorded for a single-request upload', async () => {
      const key = keyFor('photo.png');

      await uploader(key).start(new File([randomBytes(512)], 'photo.png', { type: 'image/png' }));

      expect((await head(key)).ContentType).toBe('image/png');
    });

    it('is recorded for a multipart upload', async () => {
      const key = keyFor('clip.mp4');

      await uploader(key).start(
        new File([randomBytes(11 * MiB)], 'clip.mp4', { type: 'video/mp4' })
      );

      expect((await head(key)).ContentType).toBe('video/mp4');
    });

    it('takes the type the caller names over an empty one from the browser', async () => {
      const key = keyFor('README.md');

      await uploader(key, client, { contentType: 'text/markdown' }).start(
        new File(['# hi'], 'README.md')
      );

      expect((await head(key)).ContentType).toBe('text/markdown');
    });
  });

  describe('multipart files', () => {
    it('arrive byte for byte', async () => {
      const key = keyFor('archive.bin');
      const bytes = randomBytes(11 * MiB + 123);

      await uploader(key).start(new File([bytes], 'archive.bin'));

      expect(sha256(await readBack(key))).toBe(sha256(bytes));
      // A multipart ETag ends with the number of parts: 5 + 5 + the rest.
      expect((await head(key)).ETag).toMatch(/-3"$/);
    });

    it('accept a part size above the minimum', async () => {
      const key = keyFor('larger-parts.bin');
      const bytes = randomBytes(13 * MiB);

      await uploader(key, client, { partSizeBytes: 6 * MiB }).start(new File([bytes], 'x.bin'));

      expect(sha256(await readBack(key))).toBe(sha256(bytes));
      expect((await head(key)).ETag).toMatch(/-3"$/);
    });

    it('are capped at 10,000 parts by the server', async () => {
      // The limit that makes large files need larger parts. Checked against a
      // real server rather than assumed: part 10,001 is refused outright.
      const key = keyFor('part-limit.bin');
      const { UploadId } = await client.send(
        new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key })
      );

      try {
        await expect(
          client.send(
            new UploadPartCommand({
              Bucket: BUCKET,
              Key: key,
              UploadId,
              PartNumber: 10_001,
              Body: new Uint8Array(1),
            })
          )
        ).rejects.toThrow();
      } finally {
        await client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId }));
      }
    });

    it('resume without sending the finished parts again', async () => {
      const key = keyFor('resumed.bin');
      const bytes = randomBytes(15 * MiB);
      let partsSent = 0;
      const { s3 } = interceptedClient((command, options) => {
        if (!(command instanceof UploadPartCommand)) return undefined;
        partsSent++;
        // Pause as the second part goes out. It never reaches the server.
        if (partsSent === 2) {
          up.pause();
          return heldUntilAborted(options?.abortSignal);
        }
        return undefined;
      });
      // Declared after the hook that uses it, which is fine: the hook only runs
      // once the upload is under way.
      const up = uploader(key, s3, { concurrency: 1 });
      const file = new File([bytes], 'resumed.bin');

      await up.start(file);
      await up.resume(file);

      expect(sha256(await readBack(key))).toBe(sha256(bytes));
      // Part 1 once, part 2 twice (paused, then sent), part 3 once.
      expect(partsSent).toBe(4);
    });
  });

  describe('a dropped connection', () => {
    it('is retried, and the file arrives whole with nothing left open', async () => {
      const key = keyFor('retried.bin');
      const bytes = randomBytes(16 * MiB);
      let failedOnce = false;
      const { s3 } = interceptedClient((command) => {
        if (!(command instanceof UploadPartCommand) || command.input.PartNumber !== 2) {
          return undefined;
        }
        if (failedOnce) return undefined;
        failedOnce = true;
        return Promise.reject(
          Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' })
        );
      });
      const manager = UploadManager.getInstance({
        s3,
        bucket: BUCKET,
        prefix: '',
        maxConcurrency: 1,
        partSizeMB: 5,
        retryDelaysMs: [0],
      });
      const warn = console.warn;
      console.warn = () => {};

      try {
        const id = manager.addUpload(new File([bytes], 'retried.bin'), { key });
        await waitForStatus(manager, id, 'completed');
      } finally {
        console.warn = warn;
      }

      // Resumed, not restarted: the same session finished, so nothing is open
      // and the object is exactly what was sent.
      expect(sha256(await readBack(key))).toBe(sha256(bytes));
      expect(await openUploadsFor(key)).toEqual([]);
    });

    it('survives a pause and resume during the wait, and finishes once', async () => {
      const key = keyFor('paused-while-waiting.bin');
      const bytes = randomBytes(16 * MiB);
      let failedOnce = false;
      let resumed = false;
      let heldOnce = false;
      const { s3, sent } = interceptedClient((command) => {
        if (!(command instanceof UploadPartCommand)) return undefined;
        if (!failedOnce && command.input.PartNumber === 2) {
          failedOnce = true;
          return Promise.reject(
            Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' })
          );
        }
        // The resumed attempt's first part is slow, so it is still going when
        // the wait it interrupted runs out. Only a part sent after the resume:
        // holding one of the failed attempt's would hold up the failure.
        if (resumed && !heldOnce) {
          heldOnce = true;
          return new Promise((resolve) => setTimeout(resolve, 1200)).then(() =>
            client.send(command)
          );
        }
        return undefined;
      });
      const manager = UploadManager.getInstance({
        s3,
        bucket: BUCKET,
        prefix: '',
        maxConcurrency: 1,
        partSizeMB: 5,
        retryDelaysMs: [300],
      });
      const statuses: string[] = [];
      let retrying = false;
      const { warn, error } = console;
      console.warn = () => (retrying = true);
      console.error = () => {};

      try {
        const id = manager.addUpload(new File([bytes], 'paused-while-waiting.bin'), { key });
        manager.on('statusChange', (payload) => {
          if (payload.id === id) statuses.push(payload.status);
        });
        while (!retrying) await new Promise((resolve) => setTimeout(resolve, 10));

        manager.pauseUpload(id);
        resumed = true;
        await manager.resumeUpload(id);
        await waitForStatus(manager, id, 'completed');
        // Long enough for anything a second worker would do to have happened.
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } finally {
        console.warn = warn;
        console.error = error;
      }

      // Finished once, and still finished: a second worker completing the
      // same session left the first one's completion refused, and the upload
      // marked failed.
      expect(sent.filter((name) => name === 'CompleteMultipartUploadCommand')).toHaveLength(1);
      expect(statuses[statuses.length - 1]).toBe('completed');
      expect(sha256(await readBack(key))).toBe(sha256(bytes));
      expect(await openUploadsFor(key)).toEqual([]);
    });
  });

  describe('a failed upload', () => {
    function managerFailingOnPart(partNumber: number) {
      const { s3, sent } = interceptedClient((command) =>
        command instanceof UploadPartCommand && command.input.PartNumber === partNumber
          ? Promise.reject(Object.assign(new Error('connection reset'), { name: 'NetworkError' }))
          : undefined
      );
      const manager = UploadManager.getInstance({
        s3,
        bucket: BUCKET,
        prefix: '',
        maxConcurrency: 1,
        partSizeMB: 5,
        // These tests are about failing for good. See 'a dropped connection'.
        retryDelaysMs: [],
      });
      return { manager, sent };
    }

    it('is aborted on the server, so its parts are not left billing', async () => {
      const key = keyFor('fails.bin');
      const { manager } = managerFailingOnPart(2);

      const id = manager.addUpload(new File([randomBytes(16 * MiB)], 'fails.bin'), { key });
      await waitForStatus(manager, id, 'failed');
      // The abort follows the failure; give it its round trip.
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(await openUploadsFor(key)).toEqual([]);
    });

    it('can be retried while its abort is on the wire, and the queue keeps moving', async () => {
      const key = keyFor('retried-mid-abort.bin');
      const bytes = randomBytes(16 * MiB);
      let failedOnce = false;
      const { s3 } = interceptedClient((command) => {
        if (command instanceof UploadPartCommand && !failedOnce && command.input.PartNumber === 2) {
          failedOnce = true;
          return Promise.reject(
            Object.assign(new Error('Access Denied'), {
              name: 'AccessDenied',
              $metadata: { httpStatusCode: 403 },
            })
          );
        }
        // A slow abort, as on the bad connection that failed the upload.
        if (command instanceof AbortMultipartUploadCommand) {
          return new Promise((resolve) => setTimeout(resolve, 800)).then(() =>
            client.send(command)
          );
        }
        return undefined;
      });
      const manager = UploadManager.getInstance({
        s3,
        bucket: BUCKET,
        prefix: '',
        maxConcurrency: 1,
        partSizeMB: 5,
        retryDelaysMs: [],
      });
      const { error } = console;
      console.error = () => {};

      try {
        const id = manager.addUpload(new File([bytes], 'retried-mid-abort.bin'), { key });
        await waitForStatus(manager, id, 'failed');
        // Pressed while the abort is still going.
        expect(manager.retryUpload(id)).toBe(true);
        await waitForStatus(manager, id, 'completed', 10_000);

        // The one slot came back: the next upload runs too.
        const after = manager.addUpload(new File([randomBytes(1024)], 'after.bin'), {
          key: keyFor('after.bin'),
        });
        await waitForStatus(manager, after, 'completed', 10_000);
      } finally {
        console.error = error;
      }

      expect(sha256(await readBack(key))).toBe(sha256(bytes));
      expect(await openUploadsFor(key)).toEqual([]);
    });

    it('stops sending parts once one has failed', async () => {
      const key = keyFor('stops.bin');
      const { manager, sent } = managerFailingOnPart(1);

      const id = manager.addUpload(new File([randomBytes(26 * MiB)], 'stops.bin'), { key });
      await waitForStatus(manager, id, 'failed');
      const partsWhenFailed = sent.filter((name) => name === 'UploadPartCommand').length;
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Six parts in this file and three at a time per upload. Nothing new may
      // start after the failure is reported.
      expect(sent.filter((name) => name === 'UploadPartCommand').length).toBe(partsWhenFailed);
      expect(partsWhenFailed).toBeLessThan(6);
      expect(await readObjectOrNull(key)).toBeNull();
    });
  });

  /**
   * A server-side copy in parts, which renames and moves use past CopyObject's
   * 5 GiB limit. Exercised here with the limit lowered, since a real 5 GiB
   * object would make this suite take minutes: the requests are the same
   * ones, only smaller.
   */
  describe('copying past the single-copy limit', () => {
    const asIfHuge = { maxSingleCopyBytes: 1, partSizeBytes: 5 * MiB };

    it('makes a byte-identical copy that keeps its type and metadata', async () => {
      const source = keyFor('film.mkv');
      const destination = keyFor('film-renamed.mkv');
      const bytes = randomBytes(12 * MiB + 7);
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: source,
          Body: bytes,
          ContentType: 'video/x-matroska',
          Metadata: { camera: 'x100' },
        })
      );

      await copyObject(client, BUCKET, source, destination, asIfHuge);

      expect(sha256(await readBack(destination))).toBe(sha256(bytes));
      const copied = await head(destination);
      expect(copied.ContentType).toBe('video/x-matroska');
      expect(copied.Metadata).toEqual({ camera: 'x100' });
      // Three parts of up to 5 MiB, and the upload is closed.
      expect(copied.ETag).toMatch(/-3"$/);
      expect(await openUploadsFor(destination)).toEqual([]);
    });

    it('keeps its tags, as CopyObject would', async () => {
      const source = keyFor('tagged.bin');
      const destination = keyFor('tagged-copy.bin');
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: source,
          Body: randomBytes(11 * MiB),
          // A space and a "+" both, which a query string can confuse.
          Tagging: 'project=x&note=two%20words%20%2B%20a%3Db',
        })
      );

      await copyObject(client, BUCKET, source, destination, asIfHuge);

      const { TagSet } = await client.send(
        new GetObjectTaggingCommand({ Bucket: BUCKET, Key: destination })
      );
      const tags = (TagSet ?? []).map(({ Key, Value }) => [Key, Value]).sort();
      expect(tags).toEqual([
        ['note', 'two words + a=b'],
        ['project', 'x'],
      ]);
    });

    it('copies all of a source that has grown since it was listed', async () => {
      // A folder rename hands over each object's size from its listing, which
      // is older than the version the copy pins. Here the listing said 6 MiB
      // and the object is now 12 MiB and a bit.
      const source = keyFor('grown.bin');
      const destination = keyFor('grown-copy.bin');
      const bytes = randomBytes(12 * MiB + 7);
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: source, Body: bytes }));

      await copyObject(client, BUCKET, source, destination, { ...asIfHuge, size: 6 * MiB });

      expect(sha256(await readBack(destination))).toBe(sha256(bytes));
    });

    it('copies in one request a source that has shrunk under the limit since', async () => {
      const source = keyFor('shrunk.bin');
      const destination = keyFor('shrunk-copy.bin');
      const bytes = randomBytes(6 * MiB);
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: source, Body: bytes }));

      await copyObject(client, BUCKET, source, destination, {
        maxSingleCopyBytes: 8 * MiB,
        partSizeBytes: 5 * MiB,
        size: 20 * MiB,
      });

      expect(sha256(await readBack(destination))).toBe(sha256(bytes));
      // One CopyObject keeps the source's own ETag; a multipart one ends "-N".
      expect((await head(destination)).ETag).not.toMatch(/-\d+"$/);
    });

    it('fails, and leaves no upload behind, when a part cannot be copied', async () => {
      const source = keyFor('changing.bin');
      const destination = keyFor('changing-copy.bin');
      await client.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: source, Body: randomBytes(11 * MiB) })
      );
      const { s3 } = interceptedClient((command) =>
        command instanceof UploadPartCopyCommand && command.input.PartNumber === 2
          ? Promise.reject(
              Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' })
            )
          : undefined
      );

      await expect(copyObject(s3, BUCKET, source, destination, asIfHuge)).rejects.toThrow(
        'PreconditionFailed'
      );

      expect(await readObjectOrNull(destination)).toBeNull();
      expect(await openUploadsFor(destination)).toEqual([]);
    });

    it('refuses to stitch a copy from a source replaced mid-copy', async () => {
      const source = keyFor('replaced.bin');
      const destination = keyFor('replaced-copy.bin');
      await client.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: source, Body: randomBytes(11 * MiB) })
      );
      // The source changes after the copy has read its ETag, before part 2.
      let replaced = false;
      const { s3 } = interceptedClient((command) => {
        if (command instanceof UploadPartCopyCommand && !replaced) {
          replaced = true;
          return client
            .send(
              new PutObjectCommand({ Bucket: BUCKET, Key: source, Body: randomBytes(11 * MiB) })
            )
            .then(() => client.send(command));
        }
        return undefined;
      });

      await expect(copyObject(s3, BUCKET, source, destination, asIfHuge)).rejects.toThrow();

      expect(await readObjectOrNull(destination)).toBeNull();
      expect(await openUploadsFor(destination)).toEqual([]);
    });
  });
});

async function readObjectOrNull(key: string) {
  try {
    return await head(key);
  } catch {
    return null;
  }
}
