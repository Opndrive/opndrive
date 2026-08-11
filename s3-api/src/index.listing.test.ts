/**
 * Listing and metadata coverage for `BYOS3ApiProvider`.
 *
 * These import the provider from source (`./index.js`), not from `dist/`, so
 * coverage instruments the real files and a run never depends on a stale build.
 *
 * The S3 client is intercepted by `aws-sdk-client-mock`, so nothing here makes a
 * network call or reads credentials from the environment. What's under test is
 * our own layer: which command we build, how we map the response, and what we
 * do when the SDK throws.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  ListObjectsV2Command,
  ListBucketsCommand,
  HeadObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
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

/**
 * Raw input of the nth ListObjectsV2 call. The `toHaveReceivedCommandWith`
 * matcher does a partial match and cannot express "this key was never set", so
 * absence assertions read the input directly.
 */
function inputOfCall(n: number) {
  return s3Mock.commandCalls(ListObjectsV2Command)[n]!.args[0].input;
}

/** Builds an S3ServiceException with a given HTTP status, as the SDK would throw. */
function s3Error(name: string, httpStatusCode: number) {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode },
    message: name,
  });
}

beforeEach(() => {
  s3Mock.reset();
});

describe('fetchDirectoryStructure', () => {
  it('splits a listing into files and folders and carries pagination through', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: 'users/alice/a.txt' }, { Key: 'users/alice/b.txt' }],
      CommonPrefixes: [{ Prefix: 'users/alice/photos/' }],
      NextContinuationToken: 'token-2',
      IsTruncated: true,
    });

    const result = await makeApi().fetchDirectoryStructure('users/alice/', 50);

    expect(result).toEqual({
      files: [{ Key: 'users/alice/a.txt' }, { Key: 'users/alice/b.txt' }],
      folders: [{ Prefix: 'users/alice/photos/' }],
      nextToken: 'token-2',
      isTruncated: true,
    });
  });

  it('requests a delimited listing so subfolders collapse into CommonPrefixes', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    await makeApi().fetchDirectoryStructure('photos/', 25, 'token-1');

    // Without Delimiter: '/' S3 returns every key recursively and `folders`
    // would always come back empty.
    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
      Bucket: 'test-bucket',
      Prefix: 'photos/',
      MaxKeys: 25,
      ContinuationToken: 'token-1',
      Delimiter: '/',
    });
  });

  it('defaults to 50 keys when no page size is given', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    await makeApi().fetchDirectoryStructure('photos/');

    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, { MaxKeys: 50 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('falls back to the credential prefix when the prefix is %s', async (_label, prefix) => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    await makeApi().fetchDirectoryStructure(prefix, 10);

    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, { Prefix: 'users/alice/' });
  });

  it('treats an empty prefix as the bucket root, not as "unset"', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    await makeApi().fetchDirectoryStructure('', 10);

    // '' is not nullish, so it must NOT collapse to the credential prefix -
    // otherwise a caller could never list above their configured prefix.
    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, { Prefix: '' });
  });

  it('returns empty collections when the bucket page has neither files nor folders', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    const result = await makeApi().fetchDirectoryStructure('empty/', 50);

    expect(result).toEqual({
      files: [],
      folders: [],
      nextToken: undefined,
      isTruncated: undefined,
    });
  });

  it('reports a denied listing as an error, not as an empty folder', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});
    const whenGenuinelyEmpty = await makeApi().fetchDirectoryStructure('users/alice/', 50);

    s3Mock.reset();
    s3Mock.on(ListObjectsV2Command).rejects(s3Error('AccessDenied', 403));

    // A failure must be distinguishable from an empty folder. When this method
    // swallowed errors, callers asking "does this folder exist?" answered "no"
    // on a permissions blip and then created or uploaded over what was there.
    await expect(makeApi().fetchDirectoryStructure('users/alice/', 50)).rejects.toThrow(
      'AccessDenied'
    );

    // An genuinely empty folder still reports empty, not an error.
    expect(whenGenuinelyEmpty).toEqual({
      files: [],
      folders: [],
      nextToken: undefined,
      isTruncated: undefined,
    });
  });
});

describe('fetchMetadata', () => {
  it('returns the HeadObject response for an existing key', async () => {
    const lastModified = new Date('2026-01-15T10:00:00Z');
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 2048,
      ContentType: 'application/pdf',
      LastModified: lastModified,
      ETag: '"abc123"',
    });

    const result = await makeApi().fetchMetadata('users/alice/report.pdf');

    expect(result).toMatchObject({
      ContentLength: 2048,
      ContentType: 'application/pdf',
      LastModified: lastModified,
      ETag: '"abc123"',
    });
    expect(s3Mock).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'users/alice/report.pdf',
    });
  });

  it('returns null for a missing object without logging', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    s3Mock.on(HeadObjectCommand).rejects(s3Error('NotFound', 404));

    const result = await makeApi().fetchMetadata('users/alice/gone.pdf');

    expect(result).toBeNull();
    // A 404 is how callers probe for existence; logging it would flood the
    // console during normal use.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns null but warns for failures that are not a missing object', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    s3Mock.on(HeadObjectCommand).rejects(s3Error('AccessDenied', 403));

    const result = await makeApi().fetchMetadata('users/alice/secret.pdf');

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('warns for a non-service error, since it carries no HTTP status to inspect', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    s3Mock.on(HeadObjectCommand).rejects(new Error('socket hang up'));

    const result = await makeApi().fetchMetadata('users/alice/report.pdf');

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('listFromPrefix', () => {
  it('follows continuation tokens until the listing is exhausted', async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [{ Key: 'docs/a.txt' }, { Key: 'docs/b.txt' }],
        NextContinuationToken: 'page-2',
      })
      .resolvesOnce({
        Contents: [{ Key: 'docs/c.txt' }],
        NextContinuationToken: 'page-3',
      })
      .resolvesOnce({
        Contents: [{ Key: 'docs/d.txt' }],
      });

    const keys = await makeApi().listFromPrefix('docs/');

    expect(keys).toEqual(['docs/a.txt', 'docs/b.txt', 'docs/c.txt', 'docs/d.txt']);
    expect(s3Mock).toHaveReceivedCommandTimes(ListObjectsV2Command, 3);
  });

  it('passes the previous page token on each follow-up request', async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: 'docs/a.txt' }], NextContinuationToken: 'page-2' })
      .resolvesOnce({ Contents: [{ Key: 'docs/b.txt' }] });

    await makeApi().listFromPrefix('docs/');

    // First request must not carry a token; the second must carry the one the
    // first returned, or the loop would re-read page 1 forever.
    expect(s3Mock).toHaveReceivedNthCommandWith(ListObjectsV2Command, 1, {
      Bucket: 'test-bucket',
      Prefix: 'docs/',
    });
    expect(inputOfCall(0).ContinuationToken).toBeUndefined();
    expect(s3Mock).toHaveReceivedNthCommandWith(ListObjectsV2Command, 2, {
      ContinuationToken: 'page-2',
    });
  });

  it('lists recursively, without a delimiter', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'docs/nested/deep.txt' }] });

    const keys = await makeApi().listFromPrefix('docs/');

    // renameFolder's verification step depends on this seeing every key under
    // the prefix, including nested ones - a Delimiter would collapse them.
    expect(inputOfCall(0).Delimiter).toBeUndefined();
    expect(keys).toEqual(['docs/nested/deep.txt']);
  });

  it('returns an empty list when the prefix holds nothing', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    await expect(makeApi().listFromPrefix('nothing/')).resolves.toEqual([]);
  });

  it('propagates a listing failure instead of reporting an empty prefix', async () => {
    s3Mock.on(ListObjectsV2Command).rejects(s3Error('AccessDenied', 403));

    // Unlike fetchDirectoryStructure, this must throw: renameFolder deletes
    // based on the result, so a silent empty list would be dangerous.
    await expect(makeApi().listFromPrefix('docs/')).rejects.toThrow();
  });
});

describe('search', () => {
  const page = {
    Contents: [
      { Key: 'docs/report-final.pdf' },
      { Key: 'docs/Report-Draft.pdf' },
      { Key: 'docs/notes.txt' },
      { Key: 'docs/reports/' },
      { Key: 'docs/archive/' },
    ],
  };

  it('matches files and folders case-insensitively', async () => {
    s3Mock.on(ListObjectsV2Command).resolves(page);

    const result = await makeApi().search({
      prefix: 'docs/',
      searchTerm: 'report',
      nextToken: undefined,
    });

    expect(result.files).toEqual([
      { Key: 'docs/report-final.pdf' },
      { Key: 'docs/Report-Draft.pdf' },
    ]);
    expect(result.folders).toEqual([{ Key: 'docs/reports/' }]);
    expect(result).toMatchObject({ totalFiles: 2, totalFolders: 1, totalKeys: 3 });
  });

  it('classifies keys as folders purely by their trailing slash', async () => {
    s3Mock.on(ListObjectsV2Command).resolves(page);

    const result = await makeApi().search({
      prefix: 'docs/',
      searchTerm: '',
      nextToken: undefined,
    });

    // An empty term matches everything, which makes the split visible.
    expect(result.files.map((f) => f.Key)).toEqual([
      'docs/report-final.pdf',
      'docs/Report-Draft.pdf',
      'docs/notes.txt',
    ]);
    expect(result.folders.map((f) => f.Key)).toEqual(['docs/reports/', 'docs/archive/']);
  });

  it('matches on the name only, ignoring the directory part of the key', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: 'invoices/2026/summary.txt' }],
    });

    const result = await makeApi().search({
      prefix: '',
      searchTerm: 'invoices',
      nextToken: undefined,
    });

    // 'invoices' appears in the key but not in the filename, so searching for
    // a folder name must not drag in every file underneath it.
    expect(result.files).toEqual([]);
    expect(result.totalKeys).toBe(0);
  });

  it('strips the trailing slash before matching a folder name', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'docs/archive/' }] });

    const result = await makeApi().search({
      prefix: 'docs/',
      searchTerm: 'archive',
      nextToken: undefined,
    });

    // Matching against 'archive/' would still succeed here, but a term ending
    // in the name (like 'archive') has to hit the bare name to be reliable.
    expect(result.folders).toEqual([{ Key: 'docs/archive/' }]);
    expect(result.totalFolders).toBe(1);
  });

  it('scans a full page of 1000 keys and passes the caller token through', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], NextContinuationToken: 'page-2' });

    const result = await makeApi().search({
      prefix: 'docs/',
      searchTerm: 'x',
      nextToken: 'page-1',
    });

    // Matching happens client-side over one page, so the page has to be as
    // large as S3 allows or results silently thin out.
    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
      Bucket: 'test-bucket',
      Prefix: 'docs/',
      ContinuationToken: 'page-1',
      MaxKeys: 1000,
    });
    expect(result.nextToken).toBe('page-2');
  });

  it('reports an empty result set for a page with no contents', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({});

    const result = await makeApi().search({
      prefix: 'docs/',
      searchTerm: 'anything',
      nextToken: undefined,
    });

    expect(result).toEqual({
      files: [],
      totalFiles: 0,
      folders: [],
      totalFolders: 0,
      totalKeys: 0,
      nextToken: undefined,
      isTruncated: undefined,
    });
  });

  it('propagates a listing failure', async () => {
    s3Mock.on(ListObjectsV2Command).rejects(s3Error('AccessDenied', 403));

    await expect(
      makeApi().search({ prefix: 'docs/', searchTerm: 'x', nextToken: undefined })
    ).rejects.toThrow();
  });
});

describe('getBuckets', () => {
  it('passes searchTerm through as Prefix and nextToken as ContinuationToken', async () => {
    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: 'reports-2026' }],
      ContinuationToken: 'page-2',
    });

    const result = await makeApi().getBuckets({ searchTerm: 'reports', nextToken: 'page-1' });

    expect(s3Mock).toHaveReceivedCommandWith(ListBucketsCommand, {
      Prefix: 'reports',
      ContinuationToken: 'page-1',
    });
    expect(result).toEqual({
      buckets: [{ Name: 'reports-2026' }],
      totalBuckets: 1,
      nextToken: 'page-2',
      isTruncated: true,
    });
  });

  it('lists all buckets when searchTerm is omitted', async () => {
    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: 'bucket-a' }, { Name: 'bucket-b' }],
    });

    const result = await makeApi().getBuckets({ nextToken: undefined });

    expect(result.buckets).toEqual([{ Name: 'bucket-a' }, { Name: 'bucket-b' }]);
    expect(result.totalBuckets).toBe(2);
  });

  it('reports isTruncated: false and an empty list for a page with no buckets', async () => {
    s3Mock.on(ListBucketsCommand).resolves({});

    const result = await makeApi().getBuckets({ nextToken: undefined });

    expect(result).toEqual({
      buckets: [],
      totalBuckets: 0,
      nextToken: undefined,
      isTruncated: false,
    });
  });

  it('propagates a listing failure', async () => {
    s3Mock.on(ListBucketsCommand).rejects(s3Error('AccessDenied', 403));

    await expect(makeApi().getBuckets({ nextToken: undefined })).rejects.toThrow();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
