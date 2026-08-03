/**
 * An in-memory S3 that is real enough to run the whole upload pipeline against.
 *
 * The point of this harness is that almost nothing is mocked. The queue store,
 * the executor, the dispatch hook, the s3-api `UploadManager` and the real
 * `MultipartUploader` all run unmodified; the only thing replaced is the wire.
 * Both edges are backed by the SAME object map, so a folder that "uploads"
 * here is genuinely visible to a later collision check - which is exactly the
 * interaction the 2-phase reservation exists to get right, and exactly what
 * per-layer mocks cannot exercise.
 *
 * Two edges are served:
 *
 *  - `s3Client.send`, which the uploader drives with real AWS command objects.
 *  - `apiS3`, the provider `folderExists` / `objectExists` call, so planning
 *    reads the same bucket the uploads write to.
 */

import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';

export interface FakeBucket {
  /** Committed objects, keyed by S3 key. */
  objects: Map<string, { size: number }>;
  /** Multipart uploads that were started and not yet completed or aborted. */
  openUploads: Map<string, { key: string; parts: Map<number, number> }>;
  /** Every command class name the uploader sent, in order. */
  commands: string[];
  /** Keys that were aborted rather than completed. */
  aborted: string[];
  s3Client: {
    send: (command: unknown, options?: { abortSignal?: AbortSignal }) => Promise<unknown>;
  };
  apiS3: BYOS3ApiProvider;

  /** Seeds an object as if a previous session had uploaded it. */
  put(key: string, size?: number): void;
  /** Holds every UploadPart until `release()` is called. */
  holdParts(): void;
  release(): void;
  /** Makes the listing edge throw, simulating a dead network during planning. */
  failListings(error: Error): void;
  /** Counts listing calls, to prove a failed check is not retried in a loop. */
  listingCalls(): number;
}

export function createFakeBucket(): FakeBucket {
  const objects = new Map<string, { size: number }>();
  const openUploads = new Map<string, { key: string; parts: Map<number, number> }>();
  const commands: string[] = [];
  const aborted: string[] = [];

  let uploadSeq = 0;
  let listings = 0;
  let listingError: Error | null = null;

  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  const s3Client = {
    async send(command: unknown, options?: { abortSignal?: AbortSignal }) {
      commands.push((command as object).constructor.name);

      if (command instanceof CreateMultipartUploadCommand) {
        const id = `mpu-${uploadSeq++}`;
        openUploads.set(id, { key: command.input.Key as string, parts: new Map() });
        return { UploadId: id };
      }

      if (command instanceof UploadPartCommand) {
        // The gate models a part still on the wire, which is what makes a
        // mid-stream cancel testable at all.
        if (gate) await gate;

        const signal = options?.abortSignal;
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });

        const upload = openUploads.get(command.input.UploadId as string);
        const partNumber = command.input.PartNumber as number;
        const body = command.input.Body as Blob | undefined;
        upload?.parts.set(partNumber, body?.size ?? 0);
        return { ETag: `"etag-${partNumber}"` };
      }

      if (command instanceof CompleteMultipartUploadCommand) {
        const id = command.input.UploadId as string;
        const upload = openUploads.get(id);
        if (upload) {
          let size = 0;
          for (const partSize of upload.parts.values()) size += partSize;
          objects.set(upload.key, { size });
          openUploads.delete(id);
        }
        return {};
      }

      if (command instanceof AbortMultipartUploadCommand) {
        const id = command.input.UploadId as string;
        const upload = openUploads.get(id);
        if (upload) aborted.push(upload.key);
        openUploads.delete(id);
        return {};
      }

      if (command instanceof ListPartsCommand) {
        return { Parts: [] };
      }

      return {};
    },
  };

  /** Serves the listing edge that `folderExists` uses. */
  const fetchDirectoryStructure = async (prefix: string, _maxKeys?: number) => {
    listings++;
    if (listingError) throw listingError;

    const files: { Key: string }[] = [];
    const folders: { Prefix: string }[] = [];
    for (const key of objects.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.includes('/')) folders.push({ Prefix: prefix + rest.split('/')[0] + '/' });
      else files.push({ Key: key });
    }
    return { files, folders, nextToken: undefined, isTruncated: false };
  };

  /** Serves the metadata edge that `objectExists` uses. */
  const fetchMetadata = async (key: string) => (objects.has(key) ? { ContentLength: 0 } : null);

  const apiS3 = {
    fetchDirectoryStructure,
    fetchMetadata,
    getS3Client: () => s3Client,
    getBucketName: () => 'test-bucket',
    getPrefix: () => '',
  } as unknown as BYOS3ApiProvider;

  return {
    objects,
    openUploads,
    commands,
    aborted,
    s3Client,
    apiS3,
    put(key, size = 10) {
      objects.set(key, { size });
    },
    holdParts() {
      gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
    },
    release() {
      openGate?.();
      gate = null;
      openGate = null;
    },
    failListings(error) {
      listingError = error;
    },
    listingCalls: () => listings,
  };
}
