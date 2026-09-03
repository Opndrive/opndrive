/**
 * Bucket-level coverage for `BYOS3ApiProvider`: getBuckets, createBucket,
 * deleteBucket, getBucketTags, setBucketTags, addOrUpdateBucketTags,
 * removeBucketTags.
 *
 * These import the provider from source (`./index.js`), not from `dist/`, so
 * coverage instruments the real files and a run never depends on a stale build.
 *
 * The S3 client is intercepted by `aws-sdk-client-mock`, so nothing here makes a
 * network call. Environment credentials are loaded first, then replaced with
 * deterministic fake credentials for the mocked client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketTaggingCommand,
  PutBucketTaggingCommand,
  DeleteBucketTaggingCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { BYOS3ApiProvider } from './index.js';
import type { Credentials } from './core/types.js';

dotenv.config();

const s3Mock = mockClient(S3Client);

const envCreds: Credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  bucketName: process.env.BUCKET_NAME ?? '',
  prefix: '',
  region: process.env.AWS_REGION ?? '',
};

const fakeCreds: Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucketName: 'test-bucket',
  prefix: 'users/alice/',
  region: 'us-east-1',
};

function makeApi(overrides: Partial<Credentials> = {}) {
  return new BYOS3ApiProvider({ ...envCreds, ...fakeCreds, ...overrides }, 'BYO');
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

afterEach(() => {
  vi.restoreAllMocks();
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

  it('asks in a way that makes S3 report each bucket region', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [] });

    await makeApi().getBuckets({ nextToken: undefined });

    // The point of the parameter is the response, not the page size: S3
    // includes BucketRegion only when the request carries at least one valid
    // parameter, so an unfiltered listing used to come back with no regions at
    // all - and a caller could not switch to a bucket in another region.
    expect(s3Mock).toHaveReceivedCommandWith(ListBucketsCommand, {
      MaxBuckets: 10_000,
    });
  });

  it('keeps each region with the bucket it belongs to', async () => {
    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [
        { Name: 'bucket-a', BucketRegion: 'us-east-1' },
        { Name: 'bucket-b', BucketRegion: 'eu-west-1' },
        { Name: 'bucket-c' },
      ],
    });

    const result = await makeApi().getBuckets({ nextToken: undefined });

    // Regions must never be smeared across the list: switching to bucket-b
    // with us-east-1 builds a client for the wrong region and every request
    // comes back a redirect.
    expect(result.buckets).toEqual([
      { Name: 'bucket-a', BucketRegion: 'us-east-1' },
      { Name: 'bucket-b', BucketRegion: 'eu-west-1' },
      { Name: 'bucket-c' },
    ]);
  });

  it('leaves the region undefined when the provider reported none', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [{ Name: 'bucket-a' }] });

    const result = await makeApi().getBuckets({ nextToken: undefined });

    // Undefined means "not stated". A provider that does not report regions -
    // several S3-compatible ones do not - must not have one invented for it
    // here or anywhere above.
    expect(result.buckets[0]?.BucketRegion).toBeUndefined();
  });

  it('carries regions on a continued page too', async () => {
    s3Mock
      .on(ListBucketsCommand)
      .resolvesOnce({
        Buckets: [{ Name: 'bucket-a', BucketRegion: 'us-east-1' }],
        ContinuationToken: 'page-2',
      })
      .resolvesOnce({ Buckets: [{ Name: 'bucket-b', BucketRegion: 'ap-south-1' }] });

    const api = makeApi();
    const first = await api.getBuckets({ nextToken: undefined });
    const second = await api.getBuckets({ nextToken: first.nextToken });

    expect(first.buckets[0]?.BucketRegion).toBe('us-east-1');
    expect(second.buckets[0]?.BucketRegion).toBe('ap-south-1');
    expect(s3Mock).toHaveReceivedCommandWith(ListBucketsCommand, {
      MaxBuckets: 10_000,
      ContinuationToken: 'page-2',
    });
  });
});

describe('createBucket', () => {
  it('creates a us-east-1 bucket without a location constraint', async () => {
    s3Mock.on(CreateBucketCommand).resolves({});

    const result = await makeApi({ region: 'us-east-1' }).createBucket('reports-2026');

    expect(s3Mock).toHaveReceivedCommandWith(CreateBucketCommand, { Bucket: 'reports-2026' });
    expect(s3Mock.commandCalls(CreateBucketCommand)[0]!.args[0].input).not.toHaveProperty(
      'CreateBucketConfiguration'
    );
    expect(result).toEqual({ status: 'completed', bucketName: 'reports-2026', completed: true });
  });

  it('creates a regional bucket with the region as LocationConstraint', async () => {
    s3Mock.on(CreateBucketCommand).resolves({});

    const result = await makeApi({ region: 'ap-south-1' }).createBucket('reports-2026');

    expect(s3Mock).toHaveReceivedCommandWith(CreateBucketCommand, {
      Bucket: 'reports-2026',
      CreateBucketConfiguration: { LocationConstraint: 'ap-south-1' },
    });
    expect(result).toEqual({ status: 'completed', bucketName: 'reports-2026', completed: true });
  });

  it('propagates creation failures raw', async () => {
    s3Mock.on(CreateBucketCommand).rejects(s3Error('BucketAlreadyExists', 409));

    await expect(makeApi().createBucket('reports-2026')).rejects.toThrow();
  });

  it('throws synchronously for an empty bucketName without calling S3', async () => {
    await expect(makeApi().createBucket('')).rejects.toThrow();

    expect(s3Mock).not.toHaveReceivedCommand(CreateBucketCommand);
  });
});

describe('deleteBucket', () => {
  it('deletes an empty bucket and reports completed', async () => {
    s3Mock.on(DeleteBucketCommand).resolves({});

    const result = await makeApi().deleteBucket('temp1');

    expect(s3Mock).toHaveReceivedCommandWith(DeleteBucketCommand, { Bucket: 'temp1' });
    expect(result).toEqual({ status: 'completed', bucketName: 'temp1', completed: true });
  });

  it('reports not-empty instead of throwing when S3 refuses a non-empty bucket', async () => {
    s3Mock.on(DeleteBucketCommand).rejects(s3Error('BucketNotEmpty', 409));

    const result = await makeApi().deleteBucket('temp1');

    expect(result).toEqual({ status: 'not-empty', bucketName: 'temp1', completed: false });
  });

  it('propagates any other failure raw', async () => {
    s3Mock.on(DeleteBucketCommand).rejects(s3Error('AccessDenied', 403));

    await expect(makeApi().deleteBucket('temp1')).rejects.toThrow();
  });

  it('propagates NoSuchBucket raw', async () => {
    s3Mock.on(DeleteBucketCommand).rejects(s3Error('NoSuchBucket', 404));

    await expect(makeApi().deleteBucket('temp1')).rejects.toThrow();
  });

  it('throws synchronously for an empty bucketName without calling S3', async () => {
    await expect(makeApi().deleteBucket('')).rejects.toThrow();

    expect(s3Mock).not.toHaveReceivedCommand(DeleteBucketCommand);
  });
});

describe('getBucketTags', () => {
  it('maps the SDK TagSet to BucketTag[]', async () => {
    s3Mock.on(GetBucketTaggingCommand).resolves({
      TagSet: [
        { Key: 'env', Value: 'prod' },
        { Key: 'team', Value: 'platform' },
      ],
    });

    const result = await makeApi().getBucketTags('reports-2026');

    expect(s3Mock).toHaveReceivedCommandWith(GetBucketTaggingCommand, { Bucket: 'reports-2026' });
    expect(result).toEqual({
      tags: [
        { key: 'env', value: 'prod' },
        { key: 'team', value: 'platform' },
      ],
    });
  });

  it('returns an empty tag list for an untagged bucket instead of throwing', async () => {
    s3Mock.on(GetBucketTaggingCommand).rejects(s3Error('NoSuchTagSet', 404));

    const result = await makeApi().getBucketTags('reports-2026');

    expect(result).toEqual({ tags: [] });
  });

  it('propagates other errors raw', async () => {
    s3Mock.on(GetBucketTaggingCommand).rejects(s3Error('AccessDenied', 403));

    await expect(makeApi().getBucketTags('reports-2026')).rejects.toThrow();
  });

  it('throws synchronously for an empty bucketName without calling S3', async () => {
    await expect(makeApi().getBucketTags('')).rejects.toThrow();

    expect(s3Mock).not.toHaveReceivedCommand(GetBucketTaggingCommand);
  });
});

describe('setBucketTags', () => {
  it('replaces the tag set via PutBucketTagging', async () => {
    s3Mock.on(PutBucketTaggingCommand).resolves({});

    await makeApi().setBucketTags({
      bucketName: 'reports-2026',
      tags: [{ key: 'env', value: 'prod' }],
    });

    expect(s3Mock).toHaveReceivedCommandWith(PutBucketTaggingCommand, {
      Bucket: 'reports-2026',
      Tagging: { TagSet: [{ Key: 'env', Value: 'prod' }] },
    });
    expect(s3Mock).not.toHaveReceivedCommand(DeleteBucketTaggingCommand);
  });

  it('clears all tags via DeleteBucketTagging when given an empty array', async () => {
    s3Mock.on(DeleteBucketTaggingCommand).resolves({});

    await makeApi().setBucketTags({ bucketName: 'reports-2026', tags: [] });

    expect(s3Mock).toHaveReceivedCommandWith(DeleteBucketTaggingCommand, {
      Bucket: 'reports-2026',
    });
    expect(s3Mock).not.toHaveReceivedCommand(PutBucketTaggingCommand);
  });

  it('wraps a Put failure with bucket-name context', async () => {
    s3Mock.on(PutBucketTaggingCommand).rejects(s3Error('AccessDenied', 403));

    await expect(
      makeApi().setBucketTags({ bucketName: 'reports-2026', tags: [{ key: 'env', value: 'prod' }] })
    ).rejects.toThrow(/reports-2026/);
  });

  it('throws synchronously for an empty bucketName without calling S3', async () => {
    await expect(makeApi().setBucketTags({ bucketName: '', tags: [] })).rejects.toThrow();

    expect(s3Mock).not.toHaveReceivedCommand(PutBucketTaggingCommand);
    expect(s3Mock).not.toHaveReceivedCommand(DeleteBucketTaggingCommand);
  });
});

describe('addOrUpdateBucketTags', () => {
  it('overwrites listed keys and preserves the rest', async () => {
    s3Mock.on(GetBucketTaggingCommand).resolves({
      TagSet: [
        { Key: 'env', Value: 'prod' },
        { Key: 'team', Value: 'platform' },
      ],
    });
    s3Mock.on(PutBucketTaggingCommand).resolves({});

    const result = await makeApi().addOrUpdateBucketTags({
      bucketName: 'reports-2026',
      tags: [
        { key: 'team', value: 'growth' },
        { key: 'owner', value: 'alice' },
      ],
    });

    expect(result).toEqual(
      expect.arrayContaining([
        { key: 'env', value: 'prod' },
        { key: 'team', value: 'growth' },
        { key: 'owner', value: 'alice' },
      ])
    );
    expect(result).toHaveLength(3);
    expect(s3Mock).toHaveReceivedCommandWith(PutBucketTaggingCommand, {
      Bucket: 'reports-2026',
      Tagging: {
        TagSet: expect.arrayContaining([
          { Key: 'env', Value: 'prod' },
          { Key: 'team', Value: 'growth' },
          { Key: 'owner', Value: 'alice' },
        ]),
      },
    });
  });

  it('treats an untagged bucket as an empty starting set', async () => {
    s3Mock.on(GetBucketTaggingCommand).rejects(s3Error('NoSuchTagSet', 404));
    s3Mock.on(PutBucketTaggingCommand).resolves({});

    const result = await makeApi().addOrUpdateBucketTags({
      bucketName: 'reports-2026',
      tags: [{ key: 'env', value: 'prod' }],
    });

    expect(result).toEqual([{ key: 'env', value: 'prod' }]);
  });

  it('does not enforce any provider-specific tag-count cap client-side, letting the write attempt and the provider reject it', async () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({ Key: `k${i}`, Value: 'v' }));
    s3Mock.on(GetBucketTaggingCommand).resolves({ TagSet: existing });
    s3Mock.on(PutBucketTaggingCommand).rejects(s3Error('InvalidTag', 400));

    await expect(
      makeApi().addOrUpdateBucketTags({
        bucketName: 'reports-2026',
        tags: [{ key: 'one-too-many', value: 'v' }],
      })
    ).rejects.toThrow();

    expect(s3Mock).toHaveReceivedCommand(PutBucketTaggingCommand);
  });

  it('throws synchronously for an empty bucketName without calling S3', async () => {
    await expect(makeApi().addOrUpdateBucketTags({ bucketName: '', tags: [] })).rejects.toThrow();

    expect(s3Mock).not.toHaveReceivedCommand(GetBucketTaggingCommand);
  });
});

describe('removeBucketTags', () => {
  it('removes only the given keys and preserves the rest', async () => {
    s3Mock.on(GetBucketTaggingCommand).resolves({
      TagSet: [
        { Key: 'env', Value: 'prod' },
        { Key: 'team', Value: 'platform' },
        { Key: 'owner', Value: 'alice' },
      ],
    });
    s3Mock.on(PutBucketTaggingCommand).resolves({});

    const result = await makeApi().removeBucketTags({
      bucketName: 'reports-2026',
      keys: ['team'],
    });

    expect(result).toEqual([
      { key: 'env', value: 'prod' },
      { key: 'owner', value: 'alice' },
    ]);
    expect(s3Mock).toHaveReceivedCommandWith(PutBucketTaggingCommand, {
      Bucket: 'reports-2026',
      Tagging: {
        TagSet: [
          { Key: 'env', Value: 'prod' },
          { Key: 'owner', Value: 'alice' },
        ],
      },
    });
  });

  it('ignores keys that are not present and still re-issues the write', async () => {
    s3Mock.on(GetBucketTaggingCommand).resolves({ TagSet: [{ Key: 'env', Value: 'prod' }] });
    s3Mock.on(PutBucketTaggingCommand).resolves({});

    const result = await makeApi().removeBucketTags({
      bucketName: 'reports-2026',
      keys: ['does-not-exist'],
    });

    expect(result).toEqual([{ key: 'env', value: 'prod' }]);
    expect(s3Mock).toHaveReceivedCommandWith(PutBucketTaggingCommand, {
      Bucket: 'reports-2026',
      Tagging: { TagSet: [{ Key: 'env', Value: 'prod' }] },
    });
  });

  it('routes to DeleteBucketTagging when removing the last tag', async () => {
    s3Mock.on(GetBucketTaggingCommand).resolves({ TagSet: [{ Key: 'env', Value: 'prod' }] });
    s3Mock.on(DeleteBucketTaggingCommand).resolves({});

    const result = await makeApi().removeBucketTags({
      bucketName: 'reports-2026',
      keys: ['env'],
    });

    expect(result).toEqual([]);
    expect(s3Mock).toHaveReceivedCommandWith(DeleteBucketTaggingCommand, {
      Bucket: 'reports-2026',
    });
    expect(s3Mock).not.toHaveReceivedCommand(PutBucketTaggingCommand);
  });

  it('throws synchronously for an empty bucketName without calling S3', async () => {
    await expect(makeApi().removeBucketTags({ bucketName: '', keys: [] })).rejects.toThrow();

    expect(s3Mock).not.toHaveReceivedCommand(GetBucketTaggingCommand);
  });
});
