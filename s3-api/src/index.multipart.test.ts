/**
 * `uploadMultipartParallely` is a thin factory: it maps the caller's params
 * onto a `MultipartUploadConfig` and hands back a `MultipartUploader`. The
 * mapping is what's under test here, verified through the commands the
 * returned uploader actually issues rather than by reaching into its privates.
 *
 * `MultipartUploader`'s constructor touches `localStorage` (it clears any
 * stale resume state), which does not exist in the node test environment, so
 * these suites install a memory-backed shim.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { BYOS3ApiProvider, MultipartUploader } from './index.js';
import type { Credentials } from './core/types.js';

const s3Mock = mockClient(S3Client);

const creds: Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucketName: 'test-bucket',
  prefix: 'users/alice/',
  region: 'us-east-1',
};

const MB = 1024 * 1024;

/** Minimal in-memory localStorage, enough for the uploader's get/set/remove. */
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

function makeApi() {
  return new BYOS3ApiProvider(creds, 'BYO');
}

beforeEach(() => {
  s3Mock.reset();
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadMultipartParallely', () => {
  it('returns a MultipartUploader rather than starting an upload', () => {
    const uploader = makeApi().uploadMultipartParallely({
      key: 'users/alice/big.bin',
      fileName: 'big.bin',
      partSizeMB: 5 * MB,
      concurrency: 4,
    });

    expect(uploader).toBeInstanceOf(MultipartUploader);
    // The caller drives it, so nothing should have been sent yet.
    expect(s3Mock).not.toHaveReceivedAnyCommand();
  });

  it('binds the uploader to the configured bucket and the requested key', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"etag-1"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    const uploader = makeApi().uploadMultipartParallely({
      key: 'users/alice/big.bin',
      fileName: 'big.bin',
      partSizeMB: 5 * MB,
      concurrency: 1,
    });
    await uploader.start(new File(['hello'], 'big.bin'));

    expect(s3Mock).toHaveReceivedCommandWith(CreateMultipartUploadCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
    });
    expect(s3Mock).toHaveReceivedCommandWith(UploadPartCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/big.bin',
      UploadId: 'upload-1',
      PartNumber: 1,
    });
  });

  it('completes the upload with the parts it collected', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-1' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"etag-1"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 5 * MB,
      concurrency: 1,
    });
    await uploader.start(new File(['hello'], 'f'));

    expect(s3Mock).toHaveReceivedCommandWith(CompleteMultipartUploadCommand, {
      UploadId: 'upload-1',
      MultipartUpload: { Parts: [{ ETag: '"etag-1"', PartNumber: 1 }] },
    });
  });

  it('clears any stale resume state for the same file and key', () => {
    const store = installLocalStorage();
    store.set('upload:big.bin:users/alice/big.bin', '{"uploadId":"stale"}');

    makeApi().uploadMultipartParallely({
      key: 'users/alice/big.bin',
      fileName: 'big.bin',
      partSizeMB: 5 * MB,
      concurrency: 4,
    });

    // A leftover uploadId from a previous session points at a multipart upload
    // S3 may have already aborted.
    expect(store.has('upload:big.bin:users/alice/big.bin')).toBe(false);
  });

  it('falls back to a concurrency of 3 when given a non-positive value', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'u' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    let inFlight = 0;
    let peak = 0;
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { ETag: '"e"' };
    });

    // 6 parts of 5MB, so there is enough work for the limit to be observable.
    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 5 * MB,
      concurrency: 0,
    });
    await uploader.start(new File(['x'.repeat(30 * MB)], 'f'));

    expect(peak).toBe(3);
  });

  it('honours a caller-supplied concurrency', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'u' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    let inFlight = 0;
    let peak = 0;
    s3Mock.on(UploadPartCommand).callsFake(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { ETag: '"e"' };
    });

    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 5 * MB,
      concurrency: 2,
    });
    await uploader.start(new File(['x'.repeat(30 * MB)], 'f'));

    expect(peak).toBe(2);
  });

  it('reports progress as parts complete', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'u' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});
    const progress: number[] = [];

    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 5 * MB,
      concurrency: 1,
    });
    await uploader.start(new File(['x'.repeat(15 * MB)], 'f'), (p) => progress.push(p));

    // Mirrors the uploader's own `(completed / total) * 100` so the comparison
    // is not at the mercy of float association order.
    expect(progress).toEqual([(1 / 3) * 100, (2 / 3) * 100, 100]);
  });

  it('KNOWN BUG: partSizeMB is compared against bytes, so real MB values are ignored', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'u' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    // The field is named partSizeMB, but MultipartUploader guards it with
    // `partSizeMB >= 5 * 1024 * 1024` - a BYTE threshold. So a caller passing
    // the documented unit (10, meaning 10 MB) fails the check and silently
    // gets the 5 MB default instead of 10 MB parts.
    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 10,
      concurrency: 1,
    });
    await uploader.start(new File(['x'.repeat(10 * MB)], 'f'));

    // 10 MB at the intended 10 MB part size would be ONE part; at the silently
    // substituted 5 MB default it is two. Pinned, not endorsed - fixing the
    // unit should make this test fail.
    const parts = s3Mock.commandCalls(UploadPartCommand);
    expect(parts).toHaveLength(2);
  });

  it('clamps any part size below 5MB up to the 5MB minimum', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'u' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 1024, // far below the byte threshold
      concurrency: 1,
    });
    await uploader.start(new File(['x'.repeat(12 * MB)], 'f'));

    // Clamped to 5MB, so 12MB splits into 5 + 5 + 2 rather than into 12288
    // one-kilobyte parts that S3 would reject.
    expect(s3Mock.commandCalls(UploadPartCommand)).toHaveLength(3);
  });

  it('DEAD CODE: the "non-final part <5MB" guard cannot be reached', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'u' });
    s3Mock.on(UploadPartCommand).resolves({ ETag: '"e"' });
    s3Mock.on(CompleteMultipartUploadCommand).resolves({});

    // The constructor clamps partSize to >= 5MB, and every non-final part is
    // exactly partSize, so `end - start < 5MB && partNumber !== totalParts` can
    // never both hold. The throw inside uploadParts is unreachable defensive
    // code - it will always show as an uncovered branch, and no test can fix
    // that without changing the source. Recorded here so the gap is explained
    // rather than mysterious.
    const uploader = makeApi().uploadMultipartParallely({
      key: 'k',
      fileName: 'f',
      partSizeMB: 1,
      concurrency: 1,
    });

    await expect(uploader.start(new File(['x'.repeat(6 * MB)], 'f'))).resolves.toBeUndefined();
  });
});
