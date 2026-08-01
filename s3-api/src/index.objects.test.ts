/**
 * Single-object operation coverage for `BYOS3ApiProvider`: presigned upload,
 * presigned GET, download, delete, batch delete, and folder-marker creation.
 *
 * Presigning is computed locally (an HMAC over the request), so those cases
 * need no stubbed response and never reach `send` - fake credentials still
 * produce a real, inspectable URL. Everything else goes through
 * `aws-sdk-client-mock`.
 *
 * The exhaustive `Content-Disposition` cases (unicode, header injection, path
 * stripping) live in `tests/contentDisposition.test.ts`; what's here is the
 * parameter mapping around them.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { BYOS3ApiProvider } from './index.js';
import type { Credentials } from './core/types.js';

const s3Mock = mockClient(S3Client);

const creds: Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucketName: 'test-bucket',
  prefix: 'users/alice/',
  region: 'us-east-1',
};

function makeApi(overrides: Partial<Credentials> = {}) {
  return new BYOS3ApiProvider({ ...creds, ...overrides }, 'BYO');
}

function s3Error(name: string, httpStatusCode: number) {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode },
    message: name,
  });
}

/**
 * Stubs a GetObject body. The SDK types `Body` as its own streaming union;
 * the code under test branches on the runtime type, which is the whole point
 * of these cases, so the cast is what lets us drive each branch.
 */
function stubBody(body: unknown, contentLength?: number) {
  s3Mock.on(GetObjectCommand).resolves({
    Body: body as never,
    ContentLength: contentLength,
  });
}

beforeEach(() => {
  s3Mock.reset();
});

describe('uploadWithPreSignedUrl', () => {
  it('signs a PUT for the requested key in the configured bucket', async () => {
    const url = new URL(
      await makeApi().uploadWithPreSignedUrl({
        key: 'users/alice/photo.jpg',
        expiresInSeconds: 900,
      })
    );

    expect(url.hostname.startsWith('test-bucket.')).toBe(true);
    expect(url.pathname).toBe('/users/alice/photo.jpg');
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('signs locally without contacting S3', async () => {
    await makeApi().uploadWithPreSignedUrl({ key: 'a.txt', expiresInSeconds: 60 });

    // A presign that issued a request would need live credentials and would
    // make the whole flow far slower than it needs to be.
    expect(s3Mock).not.toHaveReceivedAnyCommand();
  });

  it('rejects a key with a leading slash', async () => {
    // S3 would happily create an object whose name begins with '/', producing
    // a key no part of the UI can navigate back to.
    await expect(
      makeApi().uploadWithPreSignedUrl({ key: '/users/alice/photo.jpg', expiresInSeconds: 900 })
    ).rejects.toThrow('Key starting with /');
  });

  it('rejects a negative expiry', async () => {
    await expect(
      makeApi().uploadWithPreSignedUrl({ key: 'photo.jpg', expiresInSeconds: -1 })
    ).rejects.toThrow('Negative seconds');
  });

  it('accepts a zero expiry as the boundary of the validity check', async () => {
    // Only negatives are rejected; 0 produces an already-expired but
    // well-formed URL rather than an error.
    await expect(
      makeApi().uploadWithPreSignedUrl({ key: 'photo.jpg', expiresInSeconds: 0 })
    ).resolves.toContain('X-Amz-Signature');
  });
});

describe('getSignedUrl', () => {
  const base = { key: 'users/alice/report.pdf', expiryInSeconds: 900, isPreview: false };

  it('signs a GET for the requested key and expiry', async () => {
    const url = new URL(await makeApi().getSignedUrl(base));

    expect(url.hostname.startsWith('test-bucket.')).toBe(true);
    expect(url.pathname).toBe('/users/alice/report.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
  });

  it('asks S3 to serve previews inline with the caller content type', async () => {
    const url = new URL(
      await makeApi().getSignedUrl({
        ...base,
        isPreview: true,
        responseContentType: 'application/pdf',
      })
    );

    // Without an explicit inline disposition the browser downloads the file
    // instead of rendering it in the preview pane.
    expect(url.searchParams.get('response-content-disposition')).toBe('inline');
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
  });

  it('overrides the saved filename for downloads', async () => {
    const url = new URL(
      await makeApi().getSignedUrl({ ...base, downloadFilename: 'Q4 report.pdf' })
    );

    // The key's basename is opaque, so without this the file lands on disk
    // under the wrong name - <a download> is ignored cross-origin.
    expect(url.searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="Q4 report.pdf"; filename*=UTF-8''Q4%20report.pdf`
    );
  });

  it('omits the disposition entirely when no filename is requested', async () => {
    const url = new URL(await makeApi().getSignedUrl(base));

    expect(url.searchParams.has('response-content-disposition')).toBe(false);
  });

  it('ignores a download filename in preview mode', async () => {
    const url = new URL(
      await makeApi().getSignedUrl({ ...base, isPreview: true, downloadFilename: 'ignored.pdf' })
    );

    expect(url.searchParams.get('response-content-disposition')).toBe('inline');
  });

  it('does not set a response content type for downloads', async () => {
    const url = new URL(
      await makeApi().getSignedUrl({ ...base, responseContentType: 'application/pdf' })
    );

    // responseContentType is a preview-only knob; a download should inherit
    // whatever type the object was stored with.
    expect(url.searchParams.has('response-content-type')).toBe(false);
  });

  it('rejects a key with a leading slash', async () => {
    await expect(makeApi().getSignedUrl({ ...base, key: '/x.pdf' })).rejects.toThrow(
      'Key starting with /'
    );
  });

  it('rejects a negative expiry', async () => {
    await expect(makeApi().getSignedUrl({ ...base, expiryInSeconds: -5 })).rejects.toThrow(
      'Negative seconds'
    );
  });

  it('signs against a custom endpoint using path-style addressing', async () => {
    const url = new URL(
      await makeApi({ endpoint: 'https://minio.example.com:9000' }).getSignedUrl(base)
    );

    // S3-compatible services (MinIO and friends) rarely support virtual-host
    // buckets, so the bucket has to travel in the path instead.
    expect(url.hostname).toBe('minio.example.com');
    expect(url.pathname).toBe('/test-bucket/users/alice/report.pdf');
  });
});

describe('downloadFile', () => {
  it('concatenates a Node stream body into a Buffer', async () => {
    stubBody(Readable.from([Buffer.from('hello '), Buffer.from('world')]), 11);

    const result = await makeApi().downloadFile({ key: 'users/alice/greeting.txt' });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).toString()).toBe('hello world');
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/greeting.txt',
    });
  });

  it('converts non-Buffer chunks from a Node stream', async () => {
    // Readable.from over typed arrays yields Uint8Array, not Buffer.
    stubBody(Readable.from([new Uint8Array([104, 105])]), 2);

    const result = await makeApi().downloadFile({ key: 'a.bin' });

    expect((result as Buffer).toString()).toBe('hi');
  });

  it('reports progress as a Node stream drains', async () => {
    stubBody(Readable.from([Buffer.from('hello '), Buffer.from('world')]), 11);
    const progress: Array<[number, number, number]> = [];

    await makeApi().downloadFile({
      key: 'a.txt',
      onProgress: (pct, loaded, total) => progress.push([pct, loaded, total]),
    });

    expect(progress).toEqual([
      [(6 / 11) * 100, 6, 11],
      [100, 11, 11],
    ]);
  });

  it('collects a web stream body into a Blob', async () => {
    stubBody(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5]));
          controller.close();
        },
      }),
      5
    );

    const result = await makeApi().downloadFile({ key: 'a.bin' });

    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBe(5);
  });

  it('reports progress as a web stream drains', async () => {
    stubBody(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5]));
          controller.close();
        },
      }),
      5
    );
    const progress: Array<[number, number, number]> = [];

    await makeApi().downloadFile({
      key: 'a.bin',
      onProgress: (pct, loaded, total) => progress.push([pct, loaded, total]),
    });

    expect(progress).toEqual([
      [60, 3, 5],
      [100, 5, 5],
    ]);
  });

  it('passes a Blob body straight through', async () => {
    const blob = new Blob(['already a blob']);
    stubBody(blob, 14);

    await expect(makeApi().downloadFile({ key: 'a.txt' })).resolves.toBe(blob);
  });

  it('stays silent when the response carries no ContentLength', async () => {
    stubBody(Readable.from([Buffer.from('hello')]));
    const onProgress = vi.fn();

    await makeApi().downloadFile({ key: 'a.txt', onProgress });

    // Percentages against an unknown total would be meaningless, so the
    // callback is skipped rather than fired with NaN or Infinity.
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('stays silent for a zero-length object', async () => {
    stubBody(Readable.from([]), 0);
    const onProgress = vi.fn();

    await makeApi().downloadFile({ key: 'empty.txt', onProgress });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('throws when the response has no body', async () => {
    s3Mock.on(GetObjectCommand).resolves({});

    await expect(makeApi().downloadFile({ key: 'a.txt' })).rejects.toThrow(
      'No data returned from S3'
    );
  });

  it('throws for a body type it cannot stream', async () => {
    stubBody('a bare string', 13);

    await expect(makeApi().downloadFile({ key: 'a.txt' })).rejects.toThrow(
      'Unsupported Body type returned from S3'
    );
  });

  it('propagates a GetObject failure', async () => {
    s3Mock.on(GetObjectCommand).rejects(s3Error('NoSuchKey', 404));

    await expect(makeApi().downloadFile({ key: 'gone.txt' })).rejects.toThrow();
  });
});

describe('deleteFile', () => {
  it('deletes the given key from the configured bucket', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    await makeApi().deleteFile('users/alice/old.txt');

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(DeleteObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/old.txt',
    });
  });

  it('propagates a delete failure to the caller', async () => {
    s3Mock.on(DeleteObjectCommand).rejects(s3Error('AccessDenied', 403));

    // Unwrapped and unswallowed: the UI has to be able to tell the user the
    // file is still there.
    await expect(makeApi().deleteFile('users/alice/locked.txt')).rejects.toThrow('AccessDenied');
  });
});

describe('deleteBatch', () => {
  const batch = [{ Key: 'a.txt' }, { Key: 'b.txt' }, { Key: 'c.txt' }];

  it('sends the batch in quiet mode and reports every key deleted', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().deleteBatch(batch);

    expect(result).toEqual({ requested: 3, deleted: 3, errors: [] });
    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(DeleteObjectsCommand, {
      Bucket: 'test-bucket',
      Delete: { Objects: batch, Quiet: true },
    });
  });

  it('surfaces per-object failures that arrive alongside a 200', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({
      Errors: [
        { Key: 'b.txt', Code: 'AccessDenied', Message: 'Access Denied', VersionId: 'v1' },
        { Key: 'c.txt', Code: 'InternalError', Message: 'We encountered an internal error' },
      ],
    });

    const result = await makeApi().deleteBatch(batch);

    // DeleteObjects answers 200 even when keys fail; treating the absence of a
    // thrown error as success would silently lose data (opndrive#73).
    expect(result).toEqual({
      requested: 3,
      deleted: 1,
      errors: [
        { key: 'b.txt', versionId: 'v1', code: 'AccessDenied', message: 'Access Denied' },
        {
          key: 'c.txt',
          versionId: undefined,
          code: 'InternalError',
          message: 'We encountered an internal error',
        },
      ],
    });
  });

  it('tolerates an error entry with no key', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({ Errors: [{ Code: 'InternalError' }] });

    const result = await makeApi().deleteBatch(batch);

    // Every field on the SDK's _Error type is optional, Key included.
    expect(result.errors[0]).toEqual({
      key: '',
      versionId: undefined,
      code: 'InternalError',
      message: undefined,
    });
    expect(result.deleted).toBe(2);
  });

  it('handles an empty batch without a division-by-zero style surprise', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({});

    await expect(makeApi().deleteBatch([])).resolves.toEqual({
      requested: 0,
      deleted: 0,
      errors: [],
    });
  });

  it('propagates a failure of the request itself', async () => {
    s3Mock.on(DeleteObjectsCommand).rejects(s3Error('MalformedXML', 400));

    await expect(makeApi().deleteBatch(batch)).rejects.toThrow();
  });
});

describe('createFolder', () => {
  it('writes a zero-byte marker object at the folder key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeApi().createFolder('users/alice/photos/');

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(PutObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/photos/',
      Body: '',
    });
  });

  it('appends the trailing slash that makes the key a folder marker', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await makeApi().createFolder('users/alice/photos');

    // Without it S3 stores an ordinary empty object and the listing shows a
    // file named "photos" rather than a folder.
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, { Key: 'users/alice/photos/' });
  });

  it('rejects a key with a leading slash', async () => {
    await expect(makeApi().createFolder('/users/alice/photos')).rejects.toThrow(
      'Key starts with /'
    );
  });

  it('wraps an S3 failure with the key that could not be created', async () => {
    s3Mock.on(PutObjectCommand).rejects(s3Error('AccessDenied', 403));

    await expect(makeApi().createFolder('users/alice/photos')).rejects.toThrow(
      /Create folder failed for users\/alice\/photos\/.*AccessDenied/
    );
  });
});
