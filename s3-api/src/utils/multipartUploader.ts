import { MultipartUploadConfig } from '@/core/types.js';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  CompletedPart,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { md5, toHex } from './md5.js';

const MiB = 1024 * 1024;

/** S3's floor for every part of a multipart upload but the last. */
export const MIN_PART_SIZE = 5 * MiB;

/** S3's ceiling for one part, and for one PutObject. */
export const MAX_PART_SIZE = 5 * 1024 * MiB;

/** The most parts a single multipart upload may have. */
export const MAX_PARTS = 10_000;

/**
 * The part size to upload a file of `fileSize` bytes with.
 *
 * The preferred size, unless the file is too large to fit in MAX_PARTS parts
 * of it. Parts used to be 5 MiB whatever the file, so anything past 10,000 of
 * them - about 48.8 GiB - uploaded for hours and then failed at part 10,001.
 * Past that point the part grows, in whole MiB, to the smallest size that fits.
 *
 * Depends on nothing but its two arguments, which is what lets a resume work
 * out the same part boundaries the upload started with.
 *
 * @returns null when even MAX_PART_SIZE parts cannot hold the file (about
 *   48.8 TiB). Providers cap object size well below that anyway; this is the
 *   limit of the multipart protocol itself.
 */
export function partSizeFor(fileSize: number, preferred: number): number | null {
  const smallestThatFits = Math.ceil(fileSize / MAX_PARTS / MiB) * MiB;
  const partSize = Math.max(preferred, smallestThatFits);

  return partSize <= MAX_PART_SIZE ? partSize : null;
}

/**
 * The ETag S3 gives an object put together from these parts: the MD5 of
 * their MD5s, one after another, then "-" and how many parts there were.
 *
 * @returns null when a part's ETag is not an MD5, as under SSE-KMS or SSE-C
 *   encryption, so nothing can be worked out from it.
 */
export function multipartETag(parts: readonly CompletedPart[]): string | null {
  const digests = new Uint8Array(parts.length * 16);

  for (let index = 0; index < parts.length; index++) {
    const hex = bareETag(parts[index]!.ETag);
    if (!/^[0-9a-f]{32}$/.test(hex)) return null;

    for (let byte = 0; byte < 16; byte++) {
      digests[index * 16 + byte] = parseInt(hex.slice(byte * 2, byte * 2 + 2), 16);
    }
  }

  return `${toHex(md5(digests))}-${parts.length}`;
}

/** An ETag without its quotes, in lower case. */
function bareETag(etag: string | undefined): string {
  return (etag ?? '').replace(/"/g, '').toLowerCase();
}

/** What an S3 error says about itself. */
function errorFacts(error: unknown): { name?: unknown; status?: unknown } {
  const { name, $metadata } = (error ?? {}) as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return { name, status: $metadata?.httpStatusCode };
}

/**
 * S3's answer for a session that has been completed or aborted. It says the
 * same for both.
 */
function isNoSuchUpload(error: unknown): boolean {
  return errorFacts(error).name === 'NoSuchUpload';
}

/** S3's answer for an object that is not there. */
function isNotFound(error: unknown): boolean {
  const { name, status } = errorFacts(error);
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}

/**
 * Whether S3 answered with a 4xx: it got the request, and turned it down.
 * Anything else - no answer at all, or a 5xx - leaves open whether it acted.
 */
function wasRefused(error: unknown): boolean {
  const { status } = errorFacts(error);
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** Told the percentage done as parts finish. */
type OnProgress = ((p: number) => void) | undefined;

/**
 * Uploads one file to S3.
 *
 * A file larger than one part goes up as a multipart upload: parts in
 * parallel, resumable after a pause. A file that fits in a single part goes up
 * as one PutObject instead, for two reasons.
 *
 * An empty file cannot be sent as a multipart upload at all. It has no parts,
 * and S3 refuses to complete an upload with none ("You must specify at least
 * one part"), so every `__init__.py` or `.gitkeep` in a dropped project failed.
 *
 * And a small file gains nothing from multipart. It is one part either way, so
 * multipart costs three round trips (create, upload, complete) to do the work
 * of one, and a folder of small files pays that on every file.
 *
 * A very large file uses larger parts. See partSizeFor.
 */
export class MultipartUploader {
  private s3: S3Client;
  private bucket: string;
  private key: string;
  private fileName: string;

  // Everything a resume needs, held here and nowhere else. It used to be
  // mirrored into localStorage after every part - file name, key and upload id
  // - where nothing read it back, and where an upload that failed or was closed
  // mid-way left it for good. See no-browser-storage.test.ts.
  private uploadId?: string;
  private completedParts: CompletedPart[] = [];
  /**
   * The part size asked for, within S3's limits. Also the line between one
   * request and multipart. A very large file may use bigger parts than this.
   */
  private partSize: number;
  private isCancelled = false;
  /** Set once S3 has stored the object. Nothing is sent after that. */
  private completed = false;
  /**
   * Set when a completion was sent and it is not known whether S3 acted on
   * it. The next run asks again before anything else. See completeUpload().
   */
  private completionInDoubt = false;
  private concurrency = 3;
  /** See MultipartUploadParams.contentType. */
  private contentType?: string;

  private controllers: AbortController[] = [];

  /**
   * Moved on by every pause() and cancel(). A run belongs to the generation it
   * was asked for in, and stops once that has moved on. See exclusively().
   */
  private generation = 0;

  /** The run in progress or waiting, as a promise that never rejects. */
  private running: Promise<void> | null = null;

  constructor(config: MultipartUploadConfig) {
    this.s3 = config.s3;
    this.bucket = config.bucket;
    this.key = config.key;
    this.fileName = config.fileName;
    this.contentType = config.contentType || undefined;
    this.concurrency = config.concurrency && config.concurrency > 0 ? config.concurrency : 3;
    // S3 rejects a non-final part under 5 MiB and any part over 5 GiB.
    const requested = config.partSizeBytes > 0 ? config.partSizeBytes : MIN_PART_SIZE;
    this.partSize = Math.min(MAX_PART_SIZE, Math.max(MIN_PART_SIZE, requested));
  }

  /**
   * Uploads the file: in one request if it fits in one part, otherwise by
   * opening a session (or carrying on with the one already open), sending the
   * parts and completing it.
   *
   * A pause made before this call does not hold it back: it belongs to an
   * attempt that has already ended. An upload paused and resumed while
   * waiting to retry, before its session had opened, used to carry that pause
   * in here: every part was skipped, and so was the completion, and the
   * upload was reported done with nothing stored.
   */
  start(file: File, onProgress?: (p: number) => void): Promise<void> {
    return this.exclusively((isLive) => this.startRun(file, onProgress, isLive));
  }

  /**
   * Carries on with the session already open, from the parts S3 holds. A file
   * small enough for one request has no session, and is sent again whole.
   */
  resume(file: File, onProgress?: (p: number) => void): Promise<void> {
    return this.exclusively((isLive) => this.resumeRun(file, onProgress, isLive));
  }

  /**
   * Runs one start or resume at a time, each once the one before has settled.
   *
   * pause() aborts every part in flight, but three requests cannot be aborted
   * part way: opening the session, listing its parts, and completing it. A
   * pause and resume while one of those was out started a second run beside
   * the first, and both drove this uploader at once. Parts went up twice, a
   * second session was opened and left behind, or a completed upload was
   * resumed, and failed on a session that no longer existed. Now the second
   * run waits, and the first stops as soon as its request comes back.
   *
   * A run belongs to the generation it was asked for in. pause() and cancel()
   * move the generation on, which stops a run already going and makes one
   * still waiting do nothing at all when its turn comes.
   */
  private exclusively(run: (isLive: () => boolean) => Promise<void>): Promise<void> {
    const generation = this.generation;
    const isLive = () => generation === this.generation && !this.isCancelled;
    const go = () => (isLive() ? run(isLive) : Promise.resolve());

    // Straight away when nothing is running, so a run's first request goes
    // out in the same tick as it always has.
    const result = this.running ? this.running.then(go) : go();

    const settled = result.then(
      () => undefined,
      () => undefined
    );
    this.running = settled;
    void settled.then(() => {
      if (this.running === settled) this.running = null;
    });

    return result;
  }

  private async startRun(file: File, onProgress: OnProgress, isLive: () => boolean) {
    if (this.completed) return;
    if (this.completionInDoubt && (await this.settleCompletionInDoubt())) return;

    if (!this.uploadId && this.fitsInOneRequest(file)) {
      await this.uploadInOneRequest(file, onProgress, isLive);
      return;
    }

    // Worked out before anything is sent, so a file that cannot be uploaded
    // at all fails here instead of leaving a multipart upload behind.
    const partSize = this.partSizeForFile(file);

    if (!this.uploadId) {
      const { UploadId } = await this.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          // Set here or never: the parts and the completion carry no type, so
          // this is what the finished object is stored as.
          ContentType: this.contentTypeOf(file),
        })
      );

      // UploadId is optional on the response type, and some S3-compatible
      // services do omit it. Without this guard every part goes out with
      // UploadId: undefined and completeUpload() then returns early, so the
      // upload finishes "successfully" having stored nothing.
      if (!UploadId) {
        throw new Error(
          `S3 did not return an UploadId when starting the multipart upload for ${this.key}`
        );
      }

      this.uploadId = UploadId;

      // Cancelled while the session was opening. cancel() found no session
      // to abort then, so it is aborted here, or it stays open for good.
      if (this.isCancelled) {
        await this.abortSession();
        return;
      }
    }

    await this.uploadParts(file, partSize, onProgress, isLive);

    if (isLive()) await this.completeUpload();
  }

  /** partSizeFor this file and the configured size, or why it cannot be uploaded. */
  private partSizeForFile(file: File): number {
    const partSize = partSizeFor(file.size, this.partSize);

    if (partSize === null) {
      throw new Error(
        `${this.fileName} is too large to upload. A multipart upload can have at most ` +
          `${MAX_PARTS.toLocaleString('en-US')} parts of up to 5 GiB each, about 48.8 TiB in all.`
      );
    }

    return partSize;
  }

  /**
   * The Content-Type to store: the one this upload was given, else the
   * browser's, else none - which S3 stores as `binary/octet-stream`.
   */
  private contentTypeOf(file: File): string | undefined {
    return this.contentType || file.type || undefined;
  }

  /** Whether the whole file fits in a single part. An empty file always does. */
  private fitsInOneRequest(file: File): boolean {
    return file.size <= this.partSize;
  }

  /**
   * Sends the whole file in one PutObject.
   *
   * Pausing aborts the request. Nothing of a single request is kept on the
   * server, so there is no session to pick up: starting again sends the file
   * again from the beginning, which for a file of one part is all a multipart
   * resume would have done anyway.
   */
  private async uploadInOneRequest(file: File, onProgress: OnProgress, isLive: () => boolean) {
    const controller = new AbortController();
    this.controllers.push(controller);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
          Body: file,
          ContentType: this.contentTypeOf(file),
        }),
        { abortSignal: controller.signal }
      );
    } catch (err) {
      // Our own abort, from pause() or cancel(). A pause from before this run
      // does not count: it cannot have aborted this request, and reading it
      // as one would report a real failure as success.
      if (!isLive()) return;
      throw err;
    } finally {
      this.controllers = this.controllers.filter((c) => c !== controller);
    }

    this.completed = true;
    onProgress?.(100);
  }

  private async uploadParts(
    file: File,
    partSize: number,
    onProgress: OnProgress,
    isLive: () => boolean
  ) {
    const totalParts = Math.ceil(file.size / partSize);
    let nextPart = 1;

    // Every part S3 holds for this upload, kept current as parts finish.
    // Progress reads its size; rebuilding a set from completedParts after
    // every part instead was quadratic, 50 million insertions for one file
    // at 10,000 parts.
    const uploadedNumbers = new Set(this.completedParts.map((p) => p.PartNumber));

    /**
     * The first real failure, held until every worker has stopped.
     *
     * One part failing used to reject this immediately while the other
     * workers carried on: they sent every remaining part of an upload that
     * had already been reported as failed, to a session nothing would ever
     * complete. Now the first failure stops the rest and aborts what they
     * have in flight, and the caller hears about it only once nothing is
     * still running.
     */
    // Typed through `as` so the check after the await is not narrowed to
    // `null`: the compiler cannot see the workers assigning it.
    let failure = null as { error: unknown } | null;

    const worker = async () => {
      while (nextPart <= totalParts && isLive() && !failure) {
        const partNumber = nextPart++;
        if (uploadedNumbers.has(partNumber)) continue;

        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const blobPart = file.slice(start, end);

        // safety: only allow <5MB if it's the LAST part
        if (end - start < MIN_PART_SIZE && partNumber !== totalParts) {
          throw new Error(`Part ${partNumber} too small (<5MB). Only the last part can be <5MB.`);
        }

        const controller = new AbortController();
        this.controllers.push(controller);

        try {
          const { ETag } = await this.s3.send(
            new UploadPartCommand({
              Bucket: this.bucket,
              Key: this.key,
              UploadId: this.uploadId,
              PartNumber: partNumber,
              Body: blobPart,
            }),
            { abortSignal: controller.signal }
          );

          this.completedParts.push({ ETag: ETag!, PartNumber: partNumber });
          uploadedNumbers.add(partNumber);

          onProgress?.(Math.min(100, (uploadedNumbers.size / totalParts) * 100));
        } catch (err) {
          // Our own abort - from pause(), cancel(), or a failure below - is
          // not a failure of its own.
          if (!isLive() || failure) return;

          failure = { error: err };
          this.abortInFlight();
          return;
        } finally {
          this.controllers = this.controllers.filter((c) => c !== controller);
        }
      }
    };

    const workers = Array.from({ length: this.concurrency }, () => worker());
    await Promise.all(workers);

    // The session and the finished parts are kept, so a caller can still
    // resume() this. UploadManager does not: it aborts a failed upload, since
    // nothing there will ever resume it.
    if (failure) throw failure.error;
  }

  /** Aborts every request still in flight. */
  private abortInFlight() {
    this.controllers.forEach((c) => c.abort());
    this.controllers = [];
  }

  /**
   * Asks S3 to put the parts together, and makes sure of the answer.
   *
   * The completion is the one request whose answer matters even when it is
   * lost: S3 can store the object and the reply never arrive. Asked again, S3
   * says the session does not exist (NoSuchUpload), which is also what it
   * says when a session was aborted, and the AWS SDK retries a dropped
   * request by itself, so that can come back from this very call. The upload
   * used to resume, list the parts of the closed session, get NoSuchUpload
   * too, and be marked failed over a file that was stored.
   *
   * So a completion that got no answer, or a 5xx, is in doubt, and asked
   * again first thing on the next run. And NoSuchUpload is settled by looking
   * at the object: see confirmStored().
   */
  private async completeUpload() {
    if (!this.uploadId) return;

    // deduplicate + sort
    const deduped = new Map<number, CompletedPart>();
    for (const p of this.completedParts) {
      if (p.PartNumber != null) deduped.set(p.PartNumber, p);
    }
    const sortedParts = Array.from(deduped.values()).sort((a, b) => a.PartNumber! - b.PartNumber!);

    try {
      await this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.uploadId,
          MultipartUpload: { Parts: sortedParts },
        })
      );
    } catch (err) {
      if (!isNoSuchUpload(err)) {
        // A 4xx is an answer: the session is still there, and a resume can
        // put it right. Anything else may have stored the object.
        this.completionInDoubt = !wasRefused(err);
        throw err;
      }

      // Until the object has been looked at, so a check that gets no answer
      // is made again rather than forgotten.
      this.completionInDoubt = true;
      await this.confirmStored(sortedParts);
    }

    this.completionInDoubt = false;
    this.completed = true;
  }

  /**
   * Asks again about a completion whose answer never came, before a run does
   * anything else.
   *
   * @returns false when S3 refused it outright: the session is still open,
   *   and the run carries on and resumes it as usual.
   */
  private async settleCompletionInDoubt(): Promise<boolean> {
    try {
      await this.completeUpload();
      return true;
    } catch (err) {
      if (this.completionInDoubt) throw err;
      return false;
    }
  }

  /**
   * Settles a completion S3 has no session for: done if the object under the
   * key is the one these parts make, and an error saying why not otherwise.
   *
   * S3 gives a multipart object the ETag multipartETag() works out from its
   * parts, so a match means the object is this upload. Where it cannot be
   * worked out (part ETags that are not MD5s, as under SSE-KMS), or does not
   * match, the upload is not taken as stored: a file reported done has to be
   * there.
   *
   * @throws whatever the check threw when it got no answer, which leaves the
   *   completion in doubt, to be settled by the next run.
   */
  private async confirmStored(parts: CompletedPart[]): Promise<void> {
    let stored: string | undefined;
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key })
      );
      stored = head.ETag;
    } catch (err) {
      if (!isNotFound(err)) throw err;

      throw new Error(
        `"${this.fileName}" was not stored: its upload was ended on the server before it ` +
          'was finished. Upload it again.'
      );
    }

    const expected = multipartETag(parts);
    if (expected !== null && bareETag(stored) === expected) return;

    throw new Error(
      `Could not confirm that "${this.fileName}" was stored: its upload was ended on the ` +
        'server, and the file there now cannot be matched to it. Upload it again to be sure.'
    );
  }

  private async resumeRun(file: File, onProgress: OnProgress, isLive: () => boolean) {
    if (this.completed) return;
    if (this.completionInDoubt && (await this.settleCompletionInDoubt())) return;

    if (!this.uploadId) {
      // A single-request upload has no session to resume. Sending it again
      // is what resuming means for it.
      if (this.fitsInOneRequest(file)) return this.uploadInOneRequest(file, onProgress, isLive);

      throw new Error('No uploadId found. Start a new upload.');
    }

    // The same size the upload started with: partSizeFor depends only on the
    // file and the configured size, so the parts S3 already holds line up.
    const partSize = this.partSizeForFile(file);

    const listed = await this.s3.send(
      new ListPartsCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
      })
    );
    if (!isLive()) return;

    const remoteParts = (listed.Parts || []).map((p) => ({
      ETag: p.ETag!,
      PartNumber: p.PartNumber!,
    }));

    // merge local + remote, dedupe
    const allParts = [...this.completedParts, ...remoteParts];
    const deduped = new Map<number, CompletedPart>();
    for (const p of allParts) {
      if (p.PartNumber != null) deduped.set(p.PartNumber, p);
    }
    this.completedParts = Array.from(deduped.values());

    await this.uploadParts(file, partSize, onProgress, isLive);

    if (isLive()) await this.completeUpload();
  }

  /**
   * Stops the upload where it is, keeping what it needs to resume. A run
   * waiting on a request that cannot be aborted stops when it comes back.
   */
  pause() {
    this.generation++;
    this.abortInFlight();
  }

  /**
   * Stops the upload for good, and aborts its session on the server so the
   * parts already sent are not left there, billed. A session still opening is
   * aborted by its run once it opens.
   */
  async cancel() {
    this.isCancelled = true;
    this.generation++;
    this.abortInFlight();
    // A completed upload has no session left to abort: the object is stored.
    if (this.uploadId && !this.completed) await this.abortSession();
  }

  private async abortSession() {
    try {
      await this.s3.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.uploadId,
        })
      );
    } catch (err) {
      // Gone already, which is what aborting is for. UploadManager aborts
      // every failed upload, and reported this as parts left in the bucket.
      if (!isNoSuchUpload(err)) throw err;
    }
  }
}
