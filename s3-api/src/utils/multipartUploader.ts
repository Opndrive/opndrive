import { MultipartUploadParams } from '@/core/types.js';
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

  constructor(
    s3: S3Client,
    bucket: string,
    key: string,
    fileName: string,
    concurrency?: number,
    partSize?: number
  ) {
    this.s3 = s3;
    this.bucket = bucket;
    this.key = key;
    this.fileName = fileName;
    this.concurrency = concurrency && concurrency > 0 ? concurrency : 3;
    this.partSize = partSize && partSize >= 5 * 1024 * 1024 ? partSize : 5 * 1024 * 1024;
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

  async start(params: MultipartUploadParams) {
    this.partSize = (params.partSizeMB || 5) * 1024 * 1024;
    this.concurrency = params.concurrency || 3;

    if (!this.uploadId) {
      const { UploadId } = await this.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.key,
        })
      );
      this.uploadId = UploadId!;
    }

    await this.uploadParts(params.file, params.onProgress);

    if (!this.isPaused && !this.isCancelled) {
      await this.completeUpload();
      localStorage.removeItem(`upload:${this.fileName}:${this.key}`);
    }
  }

  private async uploadParts(file: File, onProgress?: (p: number) => void) {
    const totalParts = Math.ceil(file.size / this.partSize);
    const uploadedNumbers = new Set(this.completedParts.map((p) => p.PartNumber));

    // Create a queue of part numbers that need to be uploaded
    const partsToUpload: number[] = [];
    for (let i = 1; i <= totalParts; i++) {
      if (!uploadedNumbers.has(i)) {
        partsToUpload.push(i);
      }
    }

    const worker = async () => {
      while (partsToUpload.length > 0 && !this.isPaused && !this.isCancelled) {
        const partNumber = partsToUpload.shift(); // Safely get next part number
        if (!partNumber) break;

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

          if (!ETag) {
            throw new Error(`No ETag returned for part ${partNumber}`);
          }

          this.completedParts.push({ ETag, PartNumber: partNumber });
          this.saveState(file);

          console.log(`Part ${partNumber}/${totalParts} uploaded successfully, ETag: ${ETag}`);

          if (onProgress) {
            // Ensure progress never exceeds 100%
            const progressPercent = Math.min(100, (this.completedParts.length / totalParts) * 100);
            onProgress(progressPercent);
          }
        } catch (err) {
          if (this.isCancelled || this.isPaused) {
            return; // ignore
          }
          console.error(`Failed to upload part ${partNumber}:`, err);
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
      if (p.PartNumber != null && p.ETag) {
        // Ensure ETag is properly formatted (should have quotes)
        let etag = p.ETag;
        if (!etag.startsWith('"') && !etag.endsWith('"')) {
          etag = `"${etag}"`;
        }
        deduped.set(p.PartNumber, { ...p, ETag: etag });
      }
    }
    const sortedParts = Array.from(deduped.values()).sort((a, b) => a.PartNumber! - b.PartNumber!);

    // Validate that we have sequential part numbers starting from 1
    for (let i = 0; i < sortedParts.length; i++) {
      if (sortedParts[i].PartNumber !== i + 1) {
        throw new Error(
          `Missing part number ${i + 1}. Found parts: ${sortedParts.map((p) => p.PartNumber).join(', ')}`
        );
      }
    }

    console.log(
      'Completing multipart upload with parts:',
      sortedParts.map((p) => ({
        PartNumber: p.PartNumber,
        ETag: p.ETag,
      }))
    );

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
