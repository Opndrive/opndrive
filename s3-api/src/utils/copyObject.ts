import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  UploadPartCopyCommand,
  type CompletedPart,
  type HeadObjectCommandOutput,
  type S3Client,
} from '@aws-sdk/client-s3';

const MiB = 1024 * 1024;

/** The largest object one CopyObject request accepts. */
export const MAX_SINGLE_COPY_BYTES = 5 * 1024 * MiB;

/** UploadPartCopy's bounds: 5 MiB to 5 GiB a part, at most 10,000 parts. */
const MIN_PART_BYTES = 5 * MiB;
const MAX_PART_BYTES = 5 * 1024 * MiB;
const MAX_PARTS = 10_000;

/**
 * Large, because every part is a copy S3 does on its own side: nothing passes
 * through the browser, so fewer, bigger requests are simply faster. 512 MiB
 * makes a 50 GiB object 100 parts.
 */
const DEFAULT_PART_BYTES = 512 * MiB;

/** Parts copied at once. */
const PART_CONCURRENCY = 4;

/**
 * The part size for copying an object of `size` bytes: `preferred`, unless
 * the object needs bigger parts to fit in 10,000 of them.
 */
export function copyPartSize(size: number, preferred: number = DEFAULT_PART_BYTES): number {
  const fits = Math.ceil(Math.ceil(size / MAX_PARTS) / MiB) * MiB;
  return Math.min(MAX_PART_BYTES, Math.max(MIN_PART_BYTES, preferred, fits));
}

export interface CopyObjectOptions {
  /** The source's size, when the caller has it from a listing. Saves a HEAD. */
  size?: number;
  /** Testing seams: where the multipart copy takes over, and its part size. */
  maxSingleCopyBytes?: number;
  partSizeBytes?: number;
}

/**
 * Copies one object within a bucket, whatever its size.
 *
 * CopyObject refuses anything over 5 GiB, so renaming or moving a large video
 * or disk image used to fail outright. Up to that size this is one
 * CopyObject, exactly as before. Above it, it is a multipart upload whose
 * parts are UploadPartCopy ranges of the source, copied by S3 itself.
 *
 * Without a size from the caller, the source is HEADed first. That is one
 * extra request on a single move or rename, chosen over trying CopyObject and
 * reading the size limit out of an error message that differs by provider.
 */
export async function copyObject(
  s3: S3Client,
  bucket: string,
  sourceKey: string,
  destinationKey: string,
  options: CopyObjectOptions = {}
): Promise<void> {
  const maxSingleCopy = options.maxSingleCopyBytes ?? MAX_SINGLE_COPY_BYTES;
  const copySource = `${bucket}/${encodeURIComponent(sourceKey)}`;

  let head: HeadObjectCommandOutput | undefined;
  let size = options.size;

  // A size from a listing is enough to choose one CopyObject: that copies
  // whatever is there when it runs, and refuses it if it has since grown past
  // the limit. A multipart copy needs a HEAD regardless, for the version every
  // part is pinned to, and then that version's size is the one that counts. A
  // folder rename's listing can be minutes old by an object's turn, and parts
  // cut from it copied a source that had grown since only as far as the old
  // size - after which the rename deleted the whole original.
  if (size === undefined || size > maxSingleCopy) {
    head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }));
    size = head?.ContentLength;
  }

  if (size === undefined || size <= maxSingleCopy) {
    await s3.send(
      new CopyObjectCommand({ Bucket: bucket, CopySource: copySource, Key: destinationKey })
    );
    return;
  }

  await copyInParts(s3, bucket, copySource, destinationKey, size, head, options.partSizeBytes);
}

async function copyInParts(
  s3: S3Client,
  bucket: string,
  copySource: string,
  destinationKey: string,
  size: number,
  head: HeadObjectCommandOutput | undefined,
  partSizeBytes: number | undefined
): Promise<void> {
  // CopyObject carries the source's metadata over by itself. A multipart
  // upload starts blank, so everything CopyObject would have kept is set here
  // - or a renamed video would come out as binary/octet-stream.
  const created = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: destinationKey,
      ContentType: head?.ContentType,
      ContentDisposition: head?.ContentDisposition,
      ContentEncoding: head?.ContentEncoding,
      ContentLanguage: head?.ContentLanguage,
      CacheControl: head?.CacheControl,
      Expires: head?.Expires,
      Metadata: head?.Metadata,
      StorageClass: head?.StorageClass,
    })
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error(`Could not start a copy of ${copySource}: no upload id`);

  const partSize = copyPartSize(size, partSizeBytes);
  const partCount = Math.ceil(size / partSize);
  const parts: CompletedPart[] = new Array(partCount);

  let next = 0;
  let failure: { error: unknown } | undefined;

  const copyParts = async () => {
    // Stops taking parts after the first failure; the parts in flight finish.
    while (next < partCount && !failure) {
      const index = next++;
      const start = index * partSize;
      const end = Math.min(size, start + partSize) - 1;
      try {
        const result = await s3.send(
          new UploadPartCopyCommand({
            Bucket: bucket,
            Key: destinationKey,
            UploadId: uploadId,
            PartNumber: index + 1,
            CopySource: copySource,
            CopySourceRange: `bytes=${start}-${end}`,
            // Every part from the same version of the source. Without this, an
            // object replaced mid-copy would come out stitched from both.
            CopySourceIfMatch: head?.ETag,
          })
        );
        parts[index] = { PartNumber: index + 1, ETag: result.CopyPartResult?.ETag };
      } catch (error) {
        failure ??= { error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, copyParts));

  if (failure) {
    // Only now, with nothing left in flight: S3 can still store a part that
    // lands after the abort, and that storage is billed until it is cleaned up.
    await s3
      .send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: destinationKey, UploadId: uploadId })
      )
      .catch(() => {
        // The bucket's lifecycle rule covers an abort that could not be sent.
      });
    throw failure.error;
  }

  try {
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: destinationKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );
  } catch (error) {
    await s3
      .send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: destinationKey, UploadId: uploadId })
      )
      .catch(() => {});
    throw error;
  }
}
