import { MultipartUploadConfig } from '@/core/types.js';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  CompletedPart,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

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
  private partSize: number = 5 * 1024 * 1024;
  private isPaused = false;
  private isCancelled = false;
  private concurrency = 3;

  private controllers: AbortController[] = [];

  constructor(config: MultipartUploadConfig) {
    this.s3 = config.s3;
    this.bucket = config.bucket;
    this.key = config.key;
    this.fileName = config.fileName;
    this.concurrency = config.concurrency && config.concurrency > 0 ? config.concurrency : 3;
    // S3 rejects a multipart upload whose non-final parts are under 5 MiB.
    this.partSize =
      config.partSizeBytes && config.partSizeBytes >= 5 * 1024 * 1024
        ? config.partSizeBytes
        : 5 * 1024 * 1024;
  }

  async start(file: File, onProgress?: (p: number) => void) {
    if (!this.uploadId && this.fitsInOneRequest(file)) {
      await this.uploadInOneRequest(file, onProgress);
      return;
    }

    if (!this.uploadId) {
      const { UploadId } = await this.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
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
    }

    await this.uploadParts(file, onProgress);

    if (!this.isPaused && !this.isCancelled) {
      await this.completeUpload();
    }
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
  private async uploadInOneRequest(file: File, onProgress?: (p: number) => void) {
    if (this.isCancelled) return;

    // Any earlier pause belongs to an attempt that has already been thrown
    // away. Left set, it would also hide a genuine failure of this attempt:
    // the catch below would read it as "paused" and report success.
    this.isPaused = false;

    const controller = new AbortController();
    this.controllers.push(controller);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
          Body: file,
        }),
        { abortSignal: controller.signal }
      );
    } catch (err) {
      // Our own abort, from pause() or cancel().
      if (this.isPaused || this.isCancelled) return;
      throw err;
    } finally {
      this.controllers = this.controllers.filter((c) => c !== controller);
    }

    onProgress?.(100);
  }

  private async uploadParts(file: File, onProgress?: (p: number) => void) {
    const totalParts = Math.ceil(file.size / this.partSize);
    let nextPart = 1;

    const uploadedNumbers = new Set(this.completedParts.map((p) => p.PartNumber));

    const worker = async () => {
      while (nextPart <= totalParts && !this.isPaused && !this.isCancelled) {
        const partNumber = nextPart++;
        if (uploadedNumbers.has(partNumber)) continue;

        const start = (partNumber - 1) * this.partSize;
        const end = Math.min(start + this.partSize, file.size);
        const blobPart = file.slice(start, end);

        // safety: only allow <5MB if it's the LAST part
        if (end - start < 5 * 1024 * 1024 && partNumber !== totalParts) {
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

          if (onProgress) {
            const uniqueCompleted = new Set(this.completedParts.map((p) => p.PartNumber));
            const progressPercent = Math.min(100, (uniqueCompleted.size / totalParts) * 100);
            onProgress(progressPercent);
          }
        } catch (err) {
          if (this.isCancelled || this.isPaused) {
            return; // ignore
          }
          throw err;
        } finally {
          this.controllers = this.controllers.filter((c) => c !== controller);
        }
      }
    };

    const workers = Array.from({ length: this.concurrency }, () => worker());
    await Promise.all(workers);
  }

  private async completeUpload() {
    if (!this.uploadId) return;

    // deduplicate + sort
    const deduped = new Map<number, CompletedPart>();
    for (const p of this.completedParts) {
      if (p.PartNumber != null) deduped.set(p.PartNumber, p);
    }
    const sortedParts = Array.from(deduped.values()).sort((a, b) => a.PartNumber! - b.PartNumber!);

    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
        MultipartUpload: { Parts: sortedParts },
      })
    );
  }

  async resume(file: File, onProgress?: (p: number) => void) {
    if (!this.uploadId) {
      // A single-request upload has no session to resume. Sending it again
      // is what resuming means for it.
      if (this.fitsInOneRequest(file)) return this.uploadInOneRequest(file, onProgress);

      throw new Error('No uploadId found. Start a new upload.');
    }
    this.isPaused = false;
    this.isCancelled = false;

    const listed = await this.s3.send(
      new ListPartsCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
      })
    );

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

    await this.uploadParts(file, onProgress);

    if (!this.isPaused && !this.isCancelled) {
      await this.completeUpload();
    }
  }

  pause() {
    this.isPaused = true;
    this.controllers.forEach((c) => c.abort());
    this.controllers = [];
  }

  async cancel() {
    this.isCancelled = true;
    this.controllers.forEach((c) => c.abort());
    this.controllers = [];
    if (this.uploadId) {
      await this.s3.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
          UploadId: this.uploadId,
        })
      );
    }
  }
}
