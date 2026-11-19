/**
 * BYOS3ApiProvider against a real S3-compatible server.
 *
 * Skipped unless one is configured. Point it at the same server as the
 * multipart suite with `S3_IT_ENDPOINT`, `S3_IT_ACCESS_KEY_ID` and
 * `S3_IT_SECRET_ACCESS_KEY` (bucket `S3_IT_BUCKET`, default
 * `opndrive-integration`), or at AWS with the older `AWS_ACCESS_KEY_ID`,
 * `AWS_SECRET_ACCESS_KEY`, `BUCKET_NAME` and `AWS_REGION`.
 *
 * Every run works under a prefix of its own and builds the objects it needs
 * there first, then deletes the lot. It used to rename fixed objects it
 * assumed someone had put in the bucket (`users/<uuid>/parser.py`,
 * `users/demo1/`), so a second run found nothing to rename and failed, and two
 * runs at once fought over the same keys (opndrive#118). Now nothing it
 * touches existed before it started, and nothing is left behind.
 */

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { BYOS3ApiProvider } from '../index.js';
import type { Credentials } from '../core/types.js';

dotenv.config();

const ENDPOINT = process.env.S3_IT_ENDPOINT || undefined;
const ACCESS_KEY_ID = process.env.S3_IT_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_IT_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET =
  process.env.S3_IT_BUCKET ||
  process.env.BUCKET_NAME ||
  (ENDPOINT ? 'opndrive-integration' : undefined);
const REGION = process.env.S3_IT_REGION || process.env.AWS_REGION || 'us-east-1';

const configured = Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
const describeIfConfigured = configured ? describe : describe.skip;

/** This run's own corner of the bucket. Unique, so runs never meet. */
const RUN_PREFIX = `byos3-it/${Date.now()}-${randomBytes(3).toString('hex')}/`;
const at = (path: string) => `${RUN_PREFIX}${path}`;

const creds: Credentials = {
  accessKeyId: ACCESS_KEY_ID ?? '',
  secretAccessKey: SECRET_ACCESS_KEY ?? '',
  bucketName: BUCKET ?? '',
  prefix: '',
  region: REGION,
  ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
};

/** For setting up and checking, separately from the provider under test. */
const client = new S3Client({
  region: REGION,
  credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
});

/** What the run starts with, all under RUN_PREFIX. */
const FIXTURES: Record<string, { body: string; contentType: string }> = {
  'photo.png': { body: 'not really a png', contentType: 'image/png' },
  'scripts/parser.py': { body: 'print("parse")\n', contentType: 'text/x-python' },
  'scripts/keep.py': { body: 'print("keep")\n', contentType: 'text/x-python' },
  'users/demo1/a.txt': { body: 'a', contentType: 'text/plain' },
  'users/demo1/b.txt': { body: 'b', contentType: 'text/plain' },
  'notes/abc-report.txt': { body: 'report', contentType: 'text/plain' },
  'notes/other.txt': { body: 'other', contentType: 'text/plain' },
};

async function exists(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

async function keysUnder(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

function expectPresignedUrl(result: string) {
  const url = new URL(result);
  expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
}

describeIfConfigured('BYOS3ApiProvider against a real server', () => {
  const api = () => new BYOS3ApiProvider(creds, 'BYO');

  beforeAll(async () => {
    // A local server starts empty. Never created on AWS: that bucket is the
    // caller's own, and must already be there.
    if (ENDPOINT) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
      }
    }

    for (const [path, { body, contentType }] of Object.entries(FIXTURES)) {
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: at(path),
          Body: body,
          ContentType: contentType,
        })
      );
    }
  });

  afterAll(async () => {
    const keys = await keysUnder(RUN_PREFIX);
    for (let i = 0; i < keys.length; i += 1000) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        })
      );
    }
  });

  it('lists a folder a page at a time', async () => {
    // photo.png, plus notes/, scripts/ and users/ as folders: four entries.
    const page = await api().fetchDirectoryStructure(RUN_PREFIX, 2);

    expect(page.files.length + page.folders.length).toBe(2);
    expect(page.isTruncated).toBe(true);
    expect(page.nextToken).toBeTruthy();
  });

  it('reads the metadata of an object it uploaded', async () => {
    const metadata = await api().fetchMetadata(at('photo.png'));

    expect(metadata?.ContentType).toBe('image/png');
    expect(metadata?.ContentLength).toBe(FIXTURES['photo.png']!.body.length);
  });

  it('answers null for an object that is not there', async () => {
    await expect(api().fetchMetadata(at('missing.png'))).resolves.toBeNull();
  });

  describe('presigned upload URLs', () => {
    it('signs one for a valid key', async () => {
      const url = await api().uploadWithPreSignedUrl({
        key: at('upload/file.jpg'),
        expiresInSeconds: 900,
      });

      expectPresignedUrl(url);
    });

    it('refuses a key starting with a slash', async () => {
      await expect(
        api().uploadWithPreSignedUrl({ key: `/${at('upload/file.jpg')}`, expiresInSeconds: 900 })
      ).rejects.toBeDefined();
    });

    it('refuses a negative expiry', async () => {
      await expect(
        api().uploadWithPreSignedUrl({ key: at('upload/file.jpg'), expiresInSeconds: -2 })
      ).rejects.toBeDefined();
    });
  });

  describe('presigned download URLs', () => {
    it('signs one for downloading', async () => {
      const url = await api().getSignedUrl({
        key: at('photo.png'),
        expiryInSeconds: 900,
        isPreview: false,
        responseContentType: 'image/png',
      });

      expectPresignedUrl(url);
    });

    it('signs one for previewing', async () => {
      const url = await api().getSignedUrl({
        key: at('scripts/keep.py'),
        expiryInSeconds: 900,
        isPreview: true,
        responseContentType: 'text/plain',
      });

      expectPresignedUrl(url);
    });
  });

  describe('renaming a file', () => {
    it(
      'moves it to the new name and leaves nothing at the old one',
      { timeout: 60000 },
      async () => {
        const renamed = await api().renameFile({
          basePath: at('scripts/'),
          oldName: 'parser.py',
          newName: 'parser_n.py',
        });

        expect(renamed).toBe(true);
        expect(await exists(at('scripts/parser_n.py'))).toBe(true);
        expect(await exists(at('scripts/parser.py'))).toBe(false);
      }
    );

    it('refuses a base path starting with a slash, and touches nothing', async () => {
      // This test used to be called "throws error" and expect success; the
      // provider has always refused the leading slash.
      await expect(
        api().renameFile({ basePath: `/${at('scripts')}`, oldName: 'keep.py', newName: 'kept.py' })
      ).rejects.toThrow(/starting with \//);

      expect(await exists(at('scripts/keep.py'))).toBe(true);
      expect(await exists(at('scripts/kept.py'))).toBe(false);
    });
  });

  it('renames a folder, contents and all', { timeout: 60000 }, async () => {
    const result = await api().renameFolder({
      oldPrefix: at('users/demo1/'),
      newPrefix: at('users/exefiles/'),
    });

    expect(result.status).toBe('completed');
    expect((await keysUnder(at('users/exefiles/'))).sort()).toEqual([
      at('users/exefiles/a.txt'),
      at('users/exefiles/b.txt'),
    ]);
    expect(await keysUnder(at('users/demo1/'))).toEqual([]);
  });

  it('finds files by part of their name', async () => {
    const result = await api().search({
      prefix: RUN_PREFIX,
      searchTerm: 'abc',
      nextToken: undefined,
    });

    expect(result.files.map((file) => file.Key)).toEqual([at('notes/abc-report.txt')]);
  });
});
