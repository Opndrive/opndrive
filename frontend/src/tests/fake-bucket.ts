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
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';

/** S3's floor for every part of a multipart upload but the last. */
const MIN_PART_SIZE = 5 * 1024 * 1024;

/** An error shaped the way the SDK throws one for an S3 error response. */
function s3Error(name: string, message: string, httpStatusCode = 400) {
  return Object.assign(new Error(message), { name, $metadata: { httpStatusCode } });
}

export interface StoredObject {
  size: number;
  /** Absent when the upload sent none, which real S3 stores as binary/octet-stream. */
  contentType?: string;
}

interface OpenUpload {
  key: string;
  parts: Map<number, number>;
  /** Given when the upload is created. The parts and the completion carry none. */
  contentType?: string;
}

export interface FakeBucket {
  /** Committed objects, keyed by S3 key, with the Content-Type they were stored under. */
  objects: Map<string, StoredObject>;
  /** Multipart uploads that were started and not yet completed or aborted. */
  openUploads: Map<string, OpenUpload>;
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
  /**
   * Holds every request that carries file bytes until `release()` is called:
   * each UploadPart, and the PutObject a file small enough for one request
   * goes up in.
   */
  holdParts(): void;
  release(): void;
  /** Fails the next `count` byte-carrying requests (PutObject, UploadPart) with `error`. */
  failUploads(count: number, error: Error): void;
  /** Makes the listing edge throw, simulating a dead network during planning. */
  failListings(error: Error): void;
  /** Makes the per-file existence edge throw, as a refused or dropped HEAD does. */
  failExistenceChecks(error: Error): void;
  /** Counts listing calls, to prove a failed check is not retried in a loop. */
  listingCalls(): number;
  /** How many single-object existence checks (HEADs) have been made. */
  existenceCheckCalls(): number;
}

export function createFakeBucket(): FakeBucket {
  const objects = new Map<string, StoredObject>();
  const openUploads = new Map<string, OpenUpload>();
  const commands: string[] = [];
  const aborted: string[] = [];

  let uploadSeq = 0;
  let listings = 0;
  let existenceChecks = 0;
  let listingError: Error | null = null;
  let existenceError: Error | null = null;

  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;
  const uploadFailures = { remaining: 0, error: null as Error | null };

  /**
   * What every byte-carrying request goes through: the gate, which models a
   * request still on the wire and is what makes a mid-stream cancel testable at
   * all, and then the abort a pause or cancel sends while it waits.
   */
  async function onTheWire(options?: { abortSignal?: AbortSignal }) {
    if (gate) await gate;

    if (options?.abortSignal?.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }

    if (uploadFailures.remaining > 0) {
      uploadFailures.remaining--;
      throw uploadFailures.error;
    }
  }

  const s3Client = {
    async send(command: unknown, options?: { abortSignal?: AbortSignal }) {
      commands.push((command as object).constructor.name);

      if (command instanceof PutObjectCommand) {
        await onTheWire(options);

        const body = command.input.Body as Blob | undefined;
        objects.set(command.input.Key as string, {
          size: body?.size ?? 0,
          contentType: command.input.ContentType,
        });
        return { ETag: '"etag-single"' };
      }

      if (command instanceof CreateMultipartUploadCommand) {
        const id = `mpu-${uploadSeq++}`;
        openUploads.set(id, {
          key: command.input.Key as string,
          parts: new Map(),
          contentType: command.input.ContentType,
        });
        return { UploadId: id };
      }

      if (command instanceof UploadPartCommand) {
        await onTheWire(options);

        const upload = openUploads.get(command.input.UploadId as string);
        if (!upload) throw s3Error('NoSuchUpload', 'The specified upload does not exist.', 404);

        const partNumber = command.input.PartNumber as number;
        const body = command.input.Body as Blob | undefined;
        upload.parts.set(partNumber, body?.size ?? 0);
        return { ETag: `"etag-${partNumber}"` };
      }

      if (command instanceof CompleteMultipartUploadCommand) {
        const id = command.input.UploadId as string;
        const upload = openUploads.get(id);
        if (!upload) throw s3Error('NoSuchUpload', 'The specified upload does not exist.', 404);

        // The rules S3 checks here, which a lenient fake let slide. An empty
        // file once reached this point with no parts at all, and every test
        // passed while real S3 refused it.
        const listed = command.input.MultipartUpload?.Parts ?? [];
        if (listed.length === 0) {
          throw s3Error('InvalidRequest', 'You must specify at least one part');
        }

        let size = 0;
        listed.forEach((part, index) => {
          const partSize = upload.parts.get(part.PartNumber as number);
          if (partSize === undefined) {
            throw s3Error('InvalidPart', `Part ${part.PartNumber} was never uploaded.`);
          }
          if (index < listed.length - 1 && partSize < MIN_PART_SIZE) {
            throw s3Error('EntityTooSmall', 'Your proposed upload is smaller than the minimum.');
          }
          size += partSize;
        });

        objects.set(upload.key, { size, contentType: upload.contentType });
        openUploads.delete(id);
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
        const upload = openUploads.get(command.input.UploadId as string);
        return {
          Parts: [...(upload?.parts.keys() ?? [])].map((PartNumber) => ({
            PartNumber,
            ETag: `"etag-${PartNumber}"`,
          })),
        };
      }

      // Answering `{}` to anything unrecognised is how a fake hides a code
      // path it does not model. Say so instead.
      throw new Error(`fake bucket does not implement ${(command as object).constructor.name}`);
    },
  };

  /**
   * Serves the listing edge that `folderExists` and `findExistingNames` use.
   *
   * Paged the way S3 pages: entries in key order, objects and folders alike
   * counting towards `maxKeys`, and a token that picks up where the last page
   * stopped. A fake that always answered in one page could not tell a caller
   * that reads every page from one that reads only the first.
   */
  const fetchDirectoryStructure = async (prefix: string, maxKeys = 1000, token?: string) => {
    listings++;
    if (listingError) throw listingError;

    const entries = new Map<string, { Key: string } | { Prefix: string }>();
    for (const key of objects.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.includes('/')) {
        const folder = prefix + rest.split('/')[0] + '/';
        entries.set(folder, { Prefix: folder });
      } else {
        entries.set(key, { Key: key });
      }
    }

    const ordered = [...entries.keys()].sort();
    const start = token ? Number(token) : 0;
    const page = ordered.slice(start, start + maxKeys).map((name) => entries.get(name)!);
    const isTruncated = start + maxKeys < ordered.length;

    return {
      files: page.filter((entry): entry is { Key: string } => 'Key' in entry),
      folders: page.filter((entry): entry is { Prefix: string } => 'Prefix' in entry),
      nextToken: isTruncated ? String(start + maxKeys) : undefined,
      isTruncated,
    };
  };

  /**
   * Serves the existence edge that `objectExists` uses.
   *
   * Throws when told to, like the real one. The edge this replaced answered
   * null for a failure, which is the behaviour that let a check that never
   * ran pass for a name that was free.
   */
  const objectExists = async (key: string) => {
    existenceChecks++;
    if (existenceError) throw existenceError;

    return objects.has(key);
  };

  const apiS3 = {
    fetchDirectoryStructure,
    objectExists,
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
    failUploads(count, error) {
      uploadFailures.remaining = count;
      uploadFailures.error = error;
    },
    failListings(error) {
      listingError = error;
    },
    failExistenceChecks(error) {
      existenceError = error;
    },
    listingCalls: () => listings,
    existenceCheckCalls: () => existenceChecks,
  };
}
