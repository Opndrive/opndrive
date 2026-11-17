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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { MultipartUploader } from '../utils/multipartUploader.js';

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
});
