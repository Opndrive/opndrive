import { MultipartUploadConfig } from '@/core/types.js';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  CompletedPart,
} from '@aws-sdk/client-s3';

export class MultipartUploader {
  private s3: S3Client;
  private bucket: string;
  private key: string;
  private fileName: string;

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
    localStorage.removeItem(`upload:${this.fileName}:${this.key}`);
  }

  private saveState(file: File) {
    const state = {
      uploadId: this.uploadId,
      key: this.key,
      fileName: this.fileName,
      fileSize: file.size,
      completedParts: this.completedParts,
      partSize: this.partSize,
      concurrency: this.concurrency,
    };
    localStorage.setItem(`upload:${this.fileName}:${this.key}`, JSON.stringify(state));
  }

  async start(file: File, onProgress?: (p: number) => void) {
    // Cancelled before the queue ever reached this file. Opening a multipart
    // upload only to abort it on the next line is a round-trip nobody asked
    // for.
    if (this.isCancelled) return;

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

      // cancel() ran while that request was in flight. It looked for an
      // uploadId, found none, and returned having aborted nothing - so unless
      // this cleans up now, the upload S3 has just opened is never closed. It
      // stays in the bucket as an incomplete multipart upload, invisible in
      // any listing and billed for, until a lifecycle rule expires it. The
      // window is not theoretical: cancelling a queued file used to start the
      // next one, so uploads were routinely opened and cancelled inside the
      // same tick.
      if (this.isCancelled) {
        // Reported here rather than thrown on: the cancel that set the flag
        // resolved long ago and the manager treats a rejection from a cancelled
        // upload as expected noise, so a failure would otherwise leave the
        // orphan with nothing said about it anywhere.
        try {
          await this.abortUpload();
        } catch (err) {
          console.error(
            `Failed to abort the multipart upload for ${this.key} after it was ` +
              'cancelled mid-start. It may now be orphaned in the bucket:',
            err
          );
        }
        return;
      }
    }

    await this.uploadParts(file, onProgress);

    if (!this.isPaused && !this.isCancelled) {
      await this.completeUpload();
      localStorage.removeItem(`upload:${this.fileName}:${this.key}`);
    }
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
          this.saveState(file);

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
    if (!this.uploadId) throw new Error('No uploadId found. Start a new upload.');
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

    this.saveState(file);

    await this.uploadParts(file, onProgress);

    if (!this.isPaused && !this.isCancelled) {
      await this.completeUpload();
      localStorage.removeItem(`upload:${this.fileName}:${this.key}`);
    }
  }

  pause() {
    this.isPaused = true;
    this.controllers.forEach((c) => c.abort());
    this.controllers = [];
  }

  /**
   * Tells S3 to throw away the upload it has open, if it has one yet.
   *
   * Shared with start(), which has to send this itself when a cancel lands
   * while CreateMultipartUpload is still in flight - at that point cancel()
   * has no uploadId to work with.
   */
  private async abortUpload() {
    if (!this.uploadId) return;

    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.key,
        UploadId: this.uploadId,
      })
    );
  }

  async cancel() {
    this.isCancelled = true;
    this.controllers.forEach((c) => c.abort());
    this.controllers = [];
    // Deliberately not awaiting an in-flight CreateMultipartUpload to learn its
    // uploadId first: cancelling a folder cancels its files one after another,
    // and a network round-trip per file is exactly the wait that made this feel
    // frozen. start() sends the abort for that case instead, on its own time.
    await this.abortUpload();
    localStorage.removeItem(`upload:${this.fileName}:${this.key}`);
  }
}
