/**
 * Keeps CORS_REQUEST_HEADERS honest against the real S3 client.
 *
 * Cloudflare R2 gets a named list of request headers rather than "*", so any
 * header the SDK starts sending - a new checksum, a new tracing header after
 * an upgrade - would make R2 refuse the preflight and the app stop working
 * there, with nothing else failing. This builds the client exactly as the app
 * does, signs one request for every bucket operation the app sends, and checks
 * each header a browser would put in a preflight is on the list.
 *
 * Nothing goes over the network: a middleware placed after signing records the
 * request and stops it there.
 */
import { describe, expect, it } from 'vitest';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteBucketTaggingCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketTaggingCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketTaggingCommand,
  PutObjectCommand,
  UploadPartCommand,
  UploadPartCopyCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { BYOS3ApiProvider } from '@opndrive/s3-api';
import { CORS_REQUEST_HEADERS } from './cors';

/** Headers a browser never lists in a preflight: forbidden or CORS-safelisted. */
const NOT_PREFLIGHTED = new Set([
  'accept',
  'accept-language',
  'content-language',
  'content-length',
  'host',
  'user-agent',
  // Range is safelisted for a single byte range, which is all the app sends.
  'range',
]);

class Stop extends Error {}

function captureClient(): { client: S3Client; sent: Array<{ name: string; headers: string[] }> } {
  const api = new BYOS3ApiProvider(
    {
      region: 'auto',
      prefix: '',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      bucketName: 'test-bucket',
      endpoint: 'https://account.r2.example.test',
    },
    'BYO'
  );
  const client = api.getS3Client();
  const sent: Array<{ name: string; headers: string[] }> = [];

  client.middlewareStack.add(
    (_next, context) => async (args) => {
      const request = args.request as { headers: Record<string, string> };
      sent.push({
        name: String(context.commandName),
        headers: Object.keys(request.headers).map((h) => h.toLowerCase()),
      });
      throw new Stop();
    },
    // After finalizeRequest, where signing and retries live; before the
    // request handler that would send it.
    { step: 'deserialize', name: 'captureSignedRequest', priority: 'low' }
  );

  return { client, sent };
}

const Bucket = 'test-bucket';
const Key = 'folder/report.pdf';

/** Every bucket operation the app sends, with the parameters it sends them with. */
const OPERATIONS = [
  new ListObjectsV2Command({ Bucket, Prefix: 'folder/', Delimiter: '/', MaxKeys: 1000 }),
  new HeadObjectCommand({ Bucket, Key }),
  new GetObjectCommand({ Bucket, Key }),
  new PutObjectCommand({ Bucket, Key, Body: 'hello', ContentType: 'application/pdf' }),
  new CreateMultipartUploadCommand({ Bucket, Key, ContentType: 'application/pdf' }),
  new UploadPartCommand({ Bucket, Key, UploadId: 'u', PartNumber: 1, Body: 'part' }),
  new CompleteMultipartUploadCommand({
    Bucket,
    Key,
    UploadId: 'u',
    MultipartUpload: { Parts: [{ ETag: '"e"', PartNumber: 1 }] },
  }),
  new AbortMultipartUploadCommand({ Bucket, Key, UploadId: 'u' }),
  new ListMultipartUploadsCommand({ Bucket }),
  new ListPartsCommand({ Bucket, Key, UploadId: 'u' }),
  new CopyObjectCommand({
    Bucket,
    Key: 'renamed.pdf',
    CopySource: `${Bucket}/folder%2Freport.pdf`,
  }),
  // The multipart copy used above 5 GiB: everything copyObject.ts carries over.
  new CreateMultipartUploadCommand({
    Bucket,
    Key: 'renamed.pdf',
    ContentType: 'application/pdf',
    ContentDisposition: 'inline',
    ContentEncoding: 'gzip',
    ContentLanguage: 'en',
    CacheControl: 'no-cache',
    Expires: new Date('2030-01-01T00:00:00Z'),
    StorageClass: 'STANDARD',
    Tagging: 'team=storage',
  }),
  new UploadPartCopyCommand({
    Bucket,
    Key: 'renamed.pdf',
    UploadId: 'u',
    PartNumber: 1,
    CopySource: `${Bucket}/folder%2Freport.pdf`,
    CopySourceRange: 'bytes=0-1023',
    CopySourceIfMatch: '"e"',
  }),
  new DeleteObjectCommand({ Bucket, Key }),
  new DeleteObjectsCommand({ Bucket, Delete: { Objects: [{ Key }, { Key: 'other.pdf' }] } }),
  new GetObjectTaggingCommand({ Bucket, Key }),
  new GetBucketTaggingCommand({ Bucket }),
  new PutBucketTaggingCommand({ Bucket, Tagging: { TagSet: [{ Key: 'team', Value: 'storage' }] } }),
  new DeleteBucketTaggingCommand({ Bucket }),
];

describe('CORS_REQUEST_HEADERS', () => {
  it('names every header the app signs into a bucket request', async () => {
    const { client, sent } = captureClient();

    for (const command of OPERATIONS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(client.send(command as any)).rejects.toBeInstanceOf(Stop);
    }
    expect(sent).toHaveLength(OPERATIONS.length);

    const listed = new Set<string>(CORS_REQUEST_HEADERS);
    const missing = sent.flatMap(({ name, headers }) =>
      headers.filter((h) => !NOT_PREFLIGHTED.has(h) && !listed.has(h)).map((h) => `${name}: ${h}`)
    );

    expect(missing).toEqual([]);
  });

  it('is sorted and has no duplicates, so a diff shows exactly what changed', () => {
    const sorted = [...CORS_REQUEST_HEADERS].sort();
    expect([...CORS_REQUEST_HEADERS]).toEqual(sorted);
    expect(new Set(CORS_REQUEST_HEADERS).size).toBe(CORS_REQUEST_HEADERS.length);
  });
});
