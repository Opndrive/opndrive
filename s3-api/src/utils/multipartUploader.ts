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
    this.partSize =
      config.partSizeMB && config.partSizeMB >= 5 * 1024 * 1024
        ? config.partSizeMB
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
    if (!this.uploadId) {
      const { UploadId } = await this.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
        })
      );
      this.uploadId = UploadId!;
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
    localStorage.removeItem(`upload:${this.fileName}:${this.key}`);
  }
}
