/**
 * copyObject: one CopyObject while S3 accepts one, a server-side multipart
 * copy past 5 GiB.
 *
 * The multipart path is the one that matters and the one nobody could try by
 * hand, so most of this pins it down: the ranges cover every byte exactly
 * once, every part comes from the same version of the source, the copy keeps
 * the metadata CopyObject would have kept, and a failure leaves no upload
 * behind - aborted only once nothing is in flight.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3';
import { copyObject, copyPartSize, MAX_SINGLE_COPY_BYTES } from './copyObject.js';

const s3Mock = mockClient(S3Client);
const s3 = new S3Client({ region: 'us-east-1' });

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'up-1' });
  s3Mock
    .on(UploadPartCopyCommand)
    .callsFake(async (input) => ({ CopyPartResult: { ETag: `"etag-${input.PartNumber}"` } }));
  s3Mock.on(CompleteMultipartUploadCommand).resolves({});
  s3Mock.on(AbortMultipartUploadCommand).resolves({});
});

const partInputs = () => s3Mock.commandCalls(UploadPartCopyCommand).map((c) => c.args[0].input);

describe('copyPartSize', () => {
  it('uses big parts, since S3 copies them on its own side', () => {
    expect(copyPartSize(50 * GiB)).toBe(512 * MiB);
  });

  it('grows the part just enough to fit 10,000 of them', () => {
    // 5 TiB, S3's largest object: 10,000 parts of 525 MiB.
    const size = 5 * 1024 * GiB;
    const part = copyPartSize(size);

    expect(part).toBe(525 * MiB);
    expect(Math.ceil(size / part)).toBeLessThanOrEqual(10_000);
  });

  it('stays within S3 part bounds whatever is asked for', () => {
    expect(copyPartSize(6 * GiB, 1)).toBe(5 * MiB);
    expect(copyPartSize(6 * GiB, 10 * GiB)).toBe(5 * GiB);
  });
});

describe('an object one CopyObject can take', () => {
  it('is one CopyObject, with no HEAD when the size is known', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});

    await copyObject(s3, 'bucket', 'docs/a b.txt', 'docs/c.txt', { size: 10 });

    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(CopyObjectCommand)[0]!.args[0].input).toEqual({
      Bucket: 'bucket',
      CopySource: 'bucket/docs%2Fa%20b.txt',
      Key: 'docs/c.txt',
    });
  });

  it('asks for the size first when it was not given', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 10 });
    s3Mock.on(CopyObjectCommand).resolves({});

    await copyObject(s3, 'bucket', 'docs/a.txt', 'docs/c.txt');

    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(CreateMultipartUploadCommand)).toHaveLength(0);
  });

  it('takes exactly 5 GiB in one request', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});

    await copyObject(s3, 'bucket', 'a', 'b', { size: MAX_SINGLE_COPY_BYTES });

    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
  });
});

describe('an object over 5 GiB', () => {
  const size = 6 * GiB + 123;
  const head = {
    ContentLength: size,
    ETag: '"source-etag"',
    ContentType: 'video/mp4',
    CacheControl: 'max-age=60',
    Metadata: { camera: 'x100' },
  };

  beforeEach(() => {
    s3Mock.on(HeadObjectCommand).resolves(head);
  });

  it('copies it in parts instead of failing', async () => {
    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
    // 6 GiB in 512 MiB parts is 12, plus 123 bytes in a thirteenth.
    expect(partInputs()).toHaveLength(13);
    expect(s3Mock.commandCalls(CompleteMultipartUploadCommand)[0]!.args[0].input).toMatchObject({
      Key: 'videos/final.mp4',
      UploadId: 'up-1',
      MultipartUpload: {
        Parts: Array.from({ length: 13 }, (_, i) => ({
          PartNumber: i + 1,
          ETag: `"etag-${i + 1}"`,
        })),
      },
    });
  });

  it('covers every byte exactly once', async () => {
    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

    const ranges = partInputs()
      .sort((a, b) => a.PartNumber! - b.PartNumber!)
      .map((input) =>
        input
          .CopySourceRange!.match(/^bytes=(\d+)-(\d+)$/)!
          .slice(1)
          .map(Number)
      );

    expect(ranges[0]![0]).toBe(0);
    expect(ranges[ranges.length - 1]![1]).toBe(size - 1);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]![0]).toBe(ranges[i - 1]![1]! + 1);
  });

  it('copies every part from the same version of the source', async () => {
    // Replaced halfway through, the source would fail the copy instead of
    // producing an object stitched from two versions.
    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

    expect(new Set(partInputs().map((input) => input.CopySourceIfMatch))).toEqual(
      new Set(['"source-etag"'])
    );
  });

  it('keeps the metadata a CopyObject would have kept', async () => {
    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

    expect(s3Mock.commandCalls(CreateMultipartUploadCommand)[0]!.args[0].input).toMatchObject({
      Bucket: 'bucket',
      Key: 'videos/final.mp4',
      ContentType: 'video/mp4',
      CacheControl: 'max-age=60',
      Metadata: { camera: 'x100' },
    });
  });

  /**
   * Tags too. CopyObject copies them unless told otherwise, so a small file
   * kept its tags through a rename and a large one lost them, and with them
   * whatever lifecycle rule, access policy or cost report keyed on them.
   */
  describe('its tags', () => {
    it('are carried over, encoded the way S3 reads them', async () => {
      s3Mock.on(HeadObjectCommand).resolves({ ...head, TagCount: 2 });
      s3Mock.on(GetObjectTaggingCommand).resolves({
        TagSet: [
          { Key: 'project', Value: 'x' },
          // A space and a "+", which a query string can confuse, and an "=".
          { Key: 'note', Value: 'a b+c=d' },
        ],
      });

      await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

      expect(s3Mock.commandCalls(GetObjectTaggingCommand)[0]!.args[0].input).toMatchObject({
        Bucket: 'bucket',
        Key: 'videos/raw.mp4',
      });
      expect(s3Mock.commandCalls(CreateMultipartUploadCommand)[0]!.args[0].input.Tagging).toBe(
        'project=x&note=a%20b%2Bc%3Dd'
      );
    });

    it('are read from the version being copied', async () => {
      s3Mock.on(HeadObjectCommand).resolves({ ...head, TagCount: 1, VersionId: 'v7' });
      s3Mock.on(GetObjectTaggingCommand).resolves({ TagSet: [{ Key: 'k', Value: 'v' }] });

      await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

      expect(s3Mock.commandCalls(GetObjectTaggingCommand)[0]!.args[0].input.VersionId).toBe('v7');
    });

    it('cost no request when there are none', async () => {
      await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

      expect(s3Mock.commandCalls(GetObjectTaggingCommand)).toHaveLength(0);
      expect(
        s3Mock.commandCalls(CreateMultipartUploadCommand)[0]!.args[0].input.Tagging
      ).toBeUndefined();
    });

    it('stop the copy before it starts when they cannot be read', async () => {
      // As CopyObject would refuse: better than a copy that quietly has none.
      s3Mock.on(HeadObjectCommand).resolves({ ...head, TagCount: 1 });
      s3Mock
        .on(GetObjectTaggingCommand)
        .rejects(Object.assign(new Error('Access Denied'), { name: 'AccessDenied' }));

      await expect(
        copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size })
      ).rejects.toThrow('Access Denied');
      expect(s3Mock.commandCalls(CreateMultipartUploadCommand)).toHaveLength(0);
    });
  });

  it('works out the size itself when not given one', async () => {
    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4');

    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);
    expect(partInputs()).toHaveLength(13);
  });

  /**
   * A folder rename passes each object's size from its listing, which can be
   * minutes old by the time that object's turn comes. The parts are pinned to
   * the version a HEAD finds, so they have to be cut from that version's size
   * too. Cut from the listing's, a source that had since grown came out cut
   * short, and the rename then deleted the whole original.
   */
  it('cuts the parts from the size of the version it copies, not the listing', async () => {
    const grown = size + 1 * GiB;
    s3Mock.on(HeadObjectCommand).resolves({ ...head, ContentLength: grown });

    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

    const ends = partInputs().map((input) => Number(input.CopySourceRange!.split('-')[1]));
    expect(Math.max(...ends)).toBe(grown - 1);
  });

  it('copies in one request a source that has shrunk under the limit since', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ...head, ContentLength: 10 });
    s3Mock.on(CopyObjectCommand).resolves({});

    await copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size });

    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
    expect(partInputs()).toHaveLength(0);
  });

  it('stops taking parts after one fails, aborts once none is in flight, and throws', async () => {
    const order: string[] = [];
    s3Mock.on(UploadPartCopyCommand).callsFake(async (input) => {
      order.push(`part ${input.PartNumber}`);
      if (input.PartNumber === 2) throw new Error('PreconditionFailed');
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`part ${input.PartNumber} done`);
      return { CopyPartResult: { ETag: '"e"' } };
    });
    s3Mock.on(AbortMultipartUploadCommand).callsFake(async () => {
      order.push('abort');
      return {};
    });

    await expect(
      copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size })
    ).rejects.toThrow('PreconditionFailed');

    // Four went out together; once part 2 failed, nothing new was started.
    expect(partInputs()).toHaveLength(4);
    // The abort waited for the three still copying.
    expect(order[order.length - 1]).toBe('abort');
    expect(order.filter((step) => step.endsWith('done'))).toHaveLength(3);
    expect(s3Mock.commandCalls(CompleteMultipartUploadCommand)).toHaveLength(0);
  });

  it('still reports the copy failure when the abort fails too', async () => {
    // The bucket's lifecycle rule is the backstop for an abort that could not
    // be sent. What the caller needs is the reason the copy failed.
    s3Mock.on(UploadPartCopyCommand).rejects(new Error('AccessDenied'));
    s3Mock.on(AbortMultipartUploadCommand).rejects(new Error('network down'));

    await expect(
      copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size })
    ).rejects.toThrow('AccessDenied');
  });

  it('reports the completion failure when that abort fails too', async () => {
    s3Mock.on(CompleteMultipartUploadCommand).rejects(new Error('InvalidPart'));
    s3Mock.on(AbortMultipartUploadCommand).rejects(new Error('network down'));

    await expect(
      copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size })
    ).rejects.toThrow('InvalidPart');
  });

  it('refuses to go on when S3 gives no upload id', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({});

    await expect(
      copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size })
    ).rejects.toThrow(/no upload id/);
    expect(partInputs()).toHaveLength(0);
  });

  it('aborts when completing fails', async () => {
    s3Mock.on(CompleteMultipartUploadCommand).rejects(new Error('InvalidPart'));

    await expect(
      copyObject(s3, 'bucket', 'videos/raw.mp4', 'videos/final.mp4', { size })
    ).rejects.toThrow('InvalidPart');

    expect(s3Mock.commandCalls(AbortMultipartUploadCommand)[0]!.args[0].input).toEqual({
      Bucket: 'bucket',
      Key: 'videos/final.mp4',
      UploadId: 'up-1',
    });
  });
});
