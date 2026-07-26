import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Credentials,
  DeleteBatchError,
  DeleteBatchResult,
  DirectoryStructure,
  DownloadFileParams,
  MoveFileParams,
  MultipartUploadConfig,
  MultipartUploadParams,
  PresignedUploadParams,
  RenameFileParams,
  RenameFolderParams,
  RenameFolderError,
  RenameFolderResult,
  SearchParams,
  SearchResult,
  SignedUrlParams,
  userTypes,
} from './core/types.js';
import { mapWithConcurrency } from './utils/concurrency.js';
import { withRetry } from './utils/retry.js';
import {
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  PutObjectCommandInput,
  PutObjectCommand,
  __MetadataBearer,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  S3ServiceException,
  DeleteObjectsCommand,
  ObjectIdentifier,
  S3Client,
} from '@aws-sdk/client-s3';
import { BaseS3ApiProvider } from './core/index.js';
import { MultipartUploader } from './utils/multipartUploader.js';
import { Readable } from 'stream';

const RENAME_COPY_CONCURRENCY = 8;

/**
 * Retryable: S3-reported throttling/transient errors, any 5xx (some
 * S3-compatible providers - Wasabi, R2, MinIO - don't always use the same
 * error names AWS does, so the status-code check is the broader net), and
 * plain network failures, which surface as TypeError rather than
 * S3ServiceException.
 */
function isRetryableS3Error(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    const status = err.$metadata?.httpStatusCode;
    if (status !== undefined && status >= 500) return true;
    return ['SlowDown', 'RequestTimeout', 'ServiceUnavailable'].includes(err.name);
  }
  return err instanceof TypeError;
}

export class BYOS3ApiProvider extends BaseS3ApiProvider {
  protected userType: userTypes;

  constructor(creds: Credentials, userType: userTypes) {
    super(creds);
    this.userType = userType;
  }

  async fetchDirectoryStructure(
    prefix: string | undefined | null,
    maxKeys: number = 50,
    token?: string
  ): Promise<DirectoryStructure> {
    try {
      const input: ListObjectsV2CommandInput = {
        Bucket: this.credentials.bucketName,
        Prefix: prefix ?? this.credentials.prefix,
        MaxKeys: maxKeys,
        ContinuationToken: token,
        Delimiter: '/',
      };

      const command = new ListObjectsV2Command(input);
      const response = await this.s3.send(command);

      return {
        files: response.Contents ?? [],
        folders: response.CommonPrefixes ?? [],
        nextToken: response.NextContinuationToken,
        isTruncated: response.IsTruncated,
      };
    } catch (error) {
      return {
        files: [],
        folders: [],
        nextToken: undefined,
        isTruncated: undefined,
      };
    }
  }

  async fetchMetadata(path: string): Promise<HeadObjectCommandOutput | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.credentials.bucketName,
        Key: path,
      });

      const metadata = await this.s3.send(command);

      return metadata;
    } catch (error: unknown) {
      // 404 errors are expected when checking for file existence
      // Don't log these as they're part of normal operation
      if (error instanceof S3ServiceException && error.$metadata?.httpStatusCode === 404) {
        return null;
      }

      // Only log unexpected errors
      console.warn('Unexpected error in fetchMetadata:', error);
      return null;
    }
  }

  async uploadWithPreSignedUrl(params: PresignedUploadParams): Promise<string> {
    const { key, expiresInSeconds } = params;

    if (key.charAt(0) === '/') {
      throw new Error('Key starting with /');
    }

    if (expiresInSeconds < 0) {
      throw new Error('Negative seconds');
    }

    const input: PutObjectCommandInput = {
      Bucket: this.credentials.bucketName,
      Key: key,
    };

    const command = new PutObjectCommand(input);
    const url = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });

    return url;
  }

  uploadMultipartParallely(params: MultipartUploadParams): MultipartUploader {
    const config: MultipartUploadConfig = {
      s3: this.s3,
      bucket: this.credentials.bucketName,
      key: params.key,
      fileName: params.fileName,
      concurrency: params.concurrency,
      partSizeMB: params.partSizeMB,
    };

    const uploader = new MultipartUploader(config);

    return uploader;
  }

  async getSignedUrl(params: SignedUrlParams): Promise<string> {
    const { key, expiryInSeconds } = params;

    if (key.charAt(0) === '/') {
      throw new Error('Key starting with /');
    }

    if (expiryInSeconds < 0) {
      throw new Error('Negative seconds');
    }

    let cmd;
    if (params.isPreview) {
      cmd = new GetObjectCommand({
        Bucket: this.credentials.bucketName,
        Key: params.key,
        ResponseContentDisposition: 'inline',
        ResponseContentType: params.responseContentType,
      });
    } else {
      cmd = new GetObjectCommand({ Bucket: this.credentials.bucketName, Key: params.key });
    }
    return getSignedUrl(this.s3, cmd, { expiresIn: params.expiryInSeconds });
  }

  async downloadFile(params: DownloadFileParams): Promise<Buffer | Blob> {
    const { Body, ContentLength } = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.credentials.bucketName,
        Key: params.key,
      })
    );

    if (!Body) throw new Error('No data returned from S3');

    const total = ContentLength ?? 0;
    let loaded = 0;

    if (Body instanceof ReadableStream) {
      const reader = Body.getReader();
      const chunks: BlobPart[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          if (params.onProgress && total) {
            params.onProgress((loaded / total) * 100, loaded, total);
          }
        }
      }
      return new Blob(chunks);
    }

    if (Body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of Body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        chunks.push(buf);
        loaded += buf.length;
        if (params.onProgress && total) {
          params.onProgress((loaded / total) * 100, loaded, total);
        }
      }
      return Buffer.concat(chunks);
    }

    if (Body instanceof Blob) {
      return Body;
    }

    throw new Error('Unsupported Body type returned from S3');
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.credentials.bucketName,
        Key: key,
      })
    );
  }

  /**
   * Deletes up to 1000 objects in one request.
   *
   * DeleteObjects responds 200 even when individual keys fail (AccessDenied,
   * object-lock retention, governance holds). Those failures come back in the
   * Errors array rather than as a thrown exception, and Quiet mode suppresses
   * only the success entries - errors are still returned. Callers must check
   * `errors` before reporting the deletion as complete.
   */
  async deleteBatch(batch: ObjectIdentifier[]): Promise<DeleteBatchResult> {
    const response = await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.credentials.bucketName,
        Delete: {
          Objects: batch,
          Quiet: true,
        },
      })
    );

    // Every field on the SDK's _Error type is optional, including Key.
    const errors: DeleteBatchError[] = (response.Errors ?? []).map((e) => ({
      key: e.Key ?? '',
      versionId: e.VersionId,
      code: e.Code,
      message: e.Message,
    }));

    return {
      requested: batch.length,
      deleted: batch.length - errors.length,
      errors,
    };
  }

  async listFromPrefix(prefix: string): Promise<string[]> {
    const allKeys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.credentials.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const keys = (list.Contents || []).map((o) => o.Key!).filter(Boolean);
      allKeys.push(...keys);
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);

    return allKeys;
  }

  async moveFile(params: MoveFileParams): Promise<void> {
    try {
      const encodedSource = encodeURIComponent(params.oldKey);

      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.credentials.bucketName,
          CopySource: `${this.credentials.bucketName}/${encodedSource}`,
          Key: params.newKey,
        })
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.credentials.bucketName,
          Key: params.oldKey,
        })
      );
    } catch (err) {
      throw new Error(`Move failed for ${params.oldKey} → ${params.newKey}: ${err}`);
    }
  }

  async renameFile(params: RenameFileParams): Promise<boolean> {
    try {
      if (params.basePath.charAt(0) === '/') {
        throw new Error('Key starting with /');
      }

      if (!params.basePath.endsWith('/')) params.basePath += '/';

      const fullOldPath = `${params.basePath}${params.oldName}`;
      const fullNewPath = `${params.basePath}${params.newName}`;
      const encodedSource = encodeURIComponent(fullOldPath);

      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.credentials.bucketName,
          CopySource: `${this.credentials.bucketName}/${encodedSource}`,
          Key: fullNewPath,
        })
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.credentials.bucketName,
          Key: fullOldPath,
        })
      );

      return true;
    } catch (err) {
      throw new Error(`Rename failed for ${params.oldName} → ${params.newName}: ${err}`);
    }
  }

  /**
   * Renames a folder by copying every object to the new prefix and only then
   * deleting the old ones - never the reverse. This ordering is what makes the
   * operation safe: if anything goes wrong mid-copy (a thrown error, a closed
   * tab, a dropped connection), the old prefix is still completely untouched.
   * The worst case is a harmless, incomplete duplicate under the new prefix,
   * cleaned up by simply calling this again with the same arguments - copying
   * is naturally idempotent, so re-copying already-copied keys is a no-op.
   *
   * The old implementation copied-then-deleted one key at a time and threw on
   * the first failure, which could leave a folder split across both prefixes
   * with no record of where the split happened. See opndrive#74.
   */
  async renameFolder(params: RenameFolderParams): Promise<RenameFolderResult> {
    const bucket = this.credentials.bucketName;

    const oldPrefix = params.oldPrefix.endsWith('/') ? params.oldPrefix : params.oldPrefix + '/';
    const newPrefix = params.newPrefix.endsWith('/') ? params.newPrefix : params.newPrefix + '/';

    // 1. List every key under the old prefix.
    let continuationToken: string | undefined;
    const allKeys: string[] = [];

    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: oldPrefix,
          ContinuationToken: continuationToken,
        })
      );

      const keys = (list.Contents || []).map((o) => o.Key!).filter(Boolean);
      allKeys.push(...keys);
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);

    const totalKeys = allKeys.length;

    // 2. Copy phase - bounded concurrency, retrying transient failures. The
    // source is never modified here, so any failure leaves oldPrefix intact.
    let copiedCount = 0;
    const copyResults = await mapWithConcurrency(allKeys, RENAME_COPY_CONCURRENCY, async (key) => {
      const newKey = key.replace(oldPrefix, newPrefix);
      await withRetry(
        () =>
          this.s3.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${encodeURIComponent(key)}`,
              Key: newKey,
            })
          ),
        { isRetryable: isRetryableS3Error }
      );
      return newKey;
    });

    const copyErrors: RenameFolderError[] = [];
    copyResults.forEach((result, i) => {
      const key = allKeys[i];
      if (result.status === 'fulfilled') {
        copiedCount++;
        params.onProgress?.({
          phase: 'copying',
          total: totalKeys,
          processed: copiedCount,
          currentKey: key,
          newKey: result.value,
        });
      } else {
        const reason = result.reason;
        copyErrors.push({
          key,
          code: reason instanceof S3ServiceException ? reason.name : undefined,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });

    // Stop here on any copy failure. Nothing has been deleted, so oldPrefix is
    // still the complete, untouched source - the caller can retry the exact
    // same rename once the underlying problem (permissions, throttling) clears.
    if (copyErrors.length > 0) {
      return {
        totalKeys,
        copiedKeys: copiedCount,
        deletedKeys: 0,
        errors: copyErrors,
        completed: false,
      };
    }

    // 3. Verify. Every CopyObject call succeeding should mean newPrefix is
    // complete, but this is a cheap, independent check before we start
    // deleting the only remaining full copy of the data.
    params.onProgress?.({ phase: 'verifying', total: totalKeys, processed: 0 });
    const verifiedKeys = await this.listFromPrefix(newPrefix);
    if (verifiedKeys.length < totalKeys) {
      return {
        totalKeys,
        copiedKeys: copiedCount,
        deletedKeys: 0,
        errors: [
          {
            key: newPrefix,
            message:
              `Verification failed: expected ${totalKeys} object(s) under the new prefix, ` +
              `found ${verifiedKeys.length}. Nothing was deleted from the old prefix.`,
          },
        ],
        completed: false,
      };
    }

    // 4. Delete the old keys. Batches through deleteBatch, which already
    // surfaces per-object failures instead of swallowing them (opndrive#73).
    const deleteErrors: RenameFolderError[] = [];
    let deletedCount = 0;
    const batchSize = 1000;

    for (let i = 0; i < allKeys.length; i += batchSize) {
      const batch = allKeys.slice(i, i + batchSize);
      const result = await this.deleteBatch(batch.map((key) => ({ Key: key })));

      deletedCount += result.deleted;
      deleteErrors.push(
        ...result.errors.map((e) => ({ key: e.key, code: e.code, message: e.message }))
      );
      params.onProgress?.({ phase: 'deleting', total: totalKeys, processed: deletedCount });
    }

    return {
      totalKeys,
      copiedKeys: copiedCount,
      deletedKeys: deletedCount,
      errors: deleteErrors,
      // Old keys surviving deletion means the rename half-succeeded (new
      // location is complete, cleanup did not finish) - report that honestly
      // rather than claiming success while stray objects remain at the old path.
      completed: deleteErrors.length === 0,
    };
  }

  async createFolder(key: string): Promise<void> {
    try {
      if (key.startsWith('/')) throw new Error('Key starts with /');
      if (!key.endsWith('/')) key += '/';

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.credentials.bucketName,
          Key: key,
          Body: '',
        })
      );
    } catch (err) {
      throw new Error(`Create folder failed for ${key}: ${err}`);
    }
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const response = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.credentials.bucketName,
        Prefix: params.prefix,
        ContinuationToken: params.nextToken,
        MaxKeys: 1000,
      })
    );

    const contents = response.Contents ?? [];

    const files = contents.filter((obj) => !obj.Key?.endsWith('/'));
    const folders = contents.filter((obj) => obj.Key?.endsWith('/'));

    const filesMatching = files.filter((obj) => {
      const key = obj.Key ?? '';
      const name = key.substring(key.lastIndexOf('/') + 1);
      return name.toLowerCase().includes(params.searchTerm.toLowerCase());
    });

    const foldersMatching = folders.filter((obj) => {
      let key = obj.Key ?? '';
      key = key.endsWith('/') ? key.slice(0, -1) : key; // remove trailing slash
      const name = key.substring(key.lastIndexOf('/') + 1);
      return name.toLowerCase().includes(params.searchTerm.toLowerCase());
    });

    const totalFiles = filesMatching.length;
    const totalFolders = foldersMatching.length;
    const allKeysMatched = totalFiles + totalFolders;

    return {
      files: filesMatching,
      totalFiles,
      folders: foldersMatching,
      totalFolders,
      totalKeys: allKeysMatched,
      nextToken: response.NextContinuationToken,
      isTruncated: response.IsTruncated,
    };
  }

  getBucketName(): string {
    return this.credentials.bucketName;
  }

  getPrefix(): string {
    return this.credentials.prefix;
  }

  getRegion(): string {
    return this.credentials.region;
  }

  getS3Client(): S3Client {
    return this.s3;
  }
}

export { MultipartUploader } from './utils/multipartUploader.js';
export { UploadManager } from './utils/uploadManager.js';
export { SignedUrlUploader } from './utils/signedUrlUploader.js';
export { SignedUrlUploadManager } from './utils/signedUrlUploadManager.js';
export * from './core/types.js';
