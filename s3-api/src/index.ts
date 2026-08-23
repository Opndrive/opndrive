import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  AddOrUpdateBucketTagsParams,
  BucketTag,
  CreateBucketResult,
  Credentials,
  DeleteBatchError,
  DeleteBatchResult,
  DeleteBucketResult,
  DirectoryStructure,
  DownloadFileParams,
  GetBucketTagsResult,
  MoveFileParams,
  MultipartUploadConfig,
  MultipartUploadParams,
  PresignedUploadParams,
  RemoveBucketTagsParams,
  RenameFileParams,
  RenameFolderParams,
  RenameFolderError,
  RenameFolderResult,
  SearchParams,
  SearchResult,
  SetBucketTagsParams,
  SignedUrlParams,
  userTypes,
  ListBucketParams,
  ListBucketResult,
} from './core/types.js';
import { forEachWithConcurrency } from './utils/concurrency.js';
import { buildAttachmentDisposition } from './utils/content-disposition.js';
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
  CreateBucketCommand,
  BucketLocationConstraint,
  S3ServiceException,
  DeleteObjectsCommand,
  DeleteBucketCommand,
  DeleteBucketTaggingCommand,
  GetBucketTaggingCommand,
  PutBucketTaggingCommand,
  ObjectIdentifier,
  S3Client,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { BaseS3ApiProvider } from './core/index.js';
import { MultipartUploader } from './utils/multipartUploader.js';
import { Readable } from 'stream';

const RENAME_COPY_CONCURRENCY = 8;

/** Cap on how many missing/failed keys we enumerate in a result, to keep error payloads bounded. */
const MAX_REPORTED_KEYS = 10;

export class BYOS3ApiProvider extends BaseS3ApiProvider {
  protected userType: userTypes;

  constructor(creds: Credentials, userType: userTypes) {
    super(creds);
    this.userType = userType;
  }

  /**
   * Lists one page of a directory.
   *
   * Throws if the listing fails. It used to swallow every error and return an
   * empty structure, which made a permissions failure look exactly like an
   * empty folder - and callers that ask "does this folder exist?" would then
   * answer "no" and happily create or upload over something that was already
   * there. Callers must handle the rejection.
   */
  async fetchDirectoryStructure(
    prefix: string | undefined | null,
    maxKeys: number = 50,
    token?: string
  ): Promise<DirectoryStructure> {
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
      partSizeBytes: params.partSizeBytes,
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
      cmd = new GetObjectCommand({
        Bucket: this.credentials.bucketName,
        Key: params.key,
        ResponseContentDisposition: params.downloadFilename
          ? buildAttachmentDisposition(params.downloadFilename)
          : undefined,
      });
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

    // Overlapping prefixes would make the copy phase write into the same key
    // range the listing was taken from, and the delete phase then remove
    // freshly-copied objects. The UI only ever renames siblings, but this is a
    // published API - fail loudly rather than corrupt data for a caller that
    // does something reasonable-looking.
    if (oldPrefix === newPrefix) {
      throw new Error('renameFolder: source and destination prefixes are identical');
    }
    if (newPrefix.startsWith(oldPrefix) || oldPrefix.startsWith(newPrefix)) {
      throw new Error(
        `renameFolder: refusing to rename between overlapping prefixes ` +
          `("${oldPrefix}" and "${newPrefix}") - one is nested inside the other`
      );
    }

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

    // 2. Copy phase. Bounded concurrency; retries are handled by the S3 client's
    // own retry strategy (see maxAttempts in BaseS3ApiProvider) rather than a
    // second layer here, which would multiply attempts per object. The source is
    // never modified in this phase, so any failure leaves oldPrefix intact.
    //
    // Progress is emitted from inside the worker so callers see it DURING the
    // copy - collecting results and reporting afterwards would fire every
    // callback in one burst once the work was already finished.
    let copiedCount = 0;
    const copyErrors: RenameFolderError[] = [];

    await forEachWithConcurrency(allKeys, RENAME_COPY_CONCURRENCY, async (key) => {
      const newKey = key.replace(oldPrefix, newPrefix);
      try {
        await this.s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${encodeURIComponent(key)}`,
            Key: newKey,
          })
        );
        copiedCount++;
        params.onProgress?.({
          phase: 'copying',
          total: totalKeys,
          processed: copiedCount,
          currentKey: key,
          newKey,
        });
      } catch (err) {
        // Record and keep going - one inaccessible object shouldn't stop us
        // from finding out what else is wrong. Nothing is deleted regardless.
        copyErrors.push({
          key,
          code: err instanceof S3ServiceException ? err.name : undefined,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // Stop here on any copy failure. Nothing has been deleted, so oldPrefix is
    // still the complete, untouched source - the caller can retry the exact
    // same rename once the underlying problem (permissions, throttling) clears.
    if (copyErrors.length > 0) {
      return {
        status: 'failed',
        totalKeys,
        // Doubles as the orphaned-copy count: these objects now exist at the
        // destination. Harmless - a retry overwrites them - but the caller
        // should be able to tell the user they are there.
        copiedKeys: copiedCount,
        deletedKeys: 0,
        errors: copyErrors.slice(0, MAX_REPORTED_KEYS),
        completed: false,
      };
    }

    // 3. Verify before deleting the only other full copy of this data.
    //
    // This compares the exact set of keys we expect against what is actually
    // at the destination. An earlier version compared counts, which is
    // meaningless when the destination already contains files - and a
    // pre-populated destination is exactly what the UI's "Replace" flow
    // produces, so the check was broken precisely where it mattered: missing
    // copies could be masked by unrelated pre-existing objects, and the
    // originals would then be deleted.
    params.onProgress?.({ phase: 'verifying', total: totalKeys, processed: 0 });
    const actualAtDestination = new Set(await this.listFromPrefix(newPrefix));

    const missing: string[] = [];
    for (const key of allKeys) {
      const newKey = key.replace(oldPrefix, newPrefix);
      if (!actualAtDestination.has(newKey)) missing.push(newKey);
    }

    if (missing.length > 0) {
      return {
        status: 'failed',
        totalKeys,
        copiedKeys: copiedCount,
        deletedKeys: 0,
        errors: missing.slice(0, MAX_REPORTED_KEYS).map((key) => ({
          key,
          message:
            'Copy reported success but the object is not present at the destination. ' +
            'Nothing was deleted from the old location.',
        })),
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

    // Everything is verified present at the new location by this point. If some
    // old keys survived deletion the rename itself SUCCEEDED - the user's data
    // is complete and correct at the new name - and what remains is a cleanup
    // problem. Reporting that as a failed rename would be actively misleading.
    const cleanupIncomplete = deleteErrors.length > 0;

    return {
      status: cleanupIncomplete ? 'copied-not-cleaned' : 'completed',
      totalKeys,
      copiedKeys: copiedCount,
      deletedKeys: deletedCount,
      errors: deleteErrors.slice(0, MAX_REPORTED_KEYS),
      completed: !cleanupIncomplete,
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

  setBucketName(bucketName: string): void {
    if (!bucketName) {
      throw new Error('Bucket name cannot be empty');
    }

    this.credentials.bucketName = bucketName;
  }

  getPrefix(): string {
    return this.credentials.prefix;
  }

  getRegion(): string {
    return this.credentials.region;
  }

  async getBuckets(params: ListBucketParams): Promise<ListBucketResult> {
    const response = await this.s3.send(
      new ListBucketsCommand({
        Prefix: params.searchTerm,
        ContinuationToken: params.nextToken,
      })
    );

    const buckets = response.Buckets ?? [];

    return {
      buckets,
      totalBuckets: buckets.length,
      nextToken: response.ContinuationToken,
      isTruncated: response.ContinuationToken !== undefined,
    };
  }

  async createBucket(bucketName: string): Promise<CreateBucketResult> {
    if (!bucketName) {
      throw new Error('createBucket: bucketName is required');
    }

    const input =
      this.credentials.region === 'us-east-1'
        ? { Bucket: bucketName }
        : {
            Bucket: bucketName,
            CreateBucketConfiguration: {
              LocationConstraint: this.credentials.region as BucketLocationConstraint,
            },
          };

    await this.s3.send(new CreateBucketCommand(input));

    return { status: 'completed', bucketName, completed: true };
  }

  /**
   * Deletes a bucket. Never empties it first - S3 itself already checks
   * every current object, noncurrent version, and delete marker before
   * allowing DeleteBucket, so re-implementing that check client-side would
   * just be a redundant, racy round trip. Callers that want to empty a
   * bucket before deleting it should do so explicitly (e.g. via
   * listFromPrefix + deleteBatch) before calling this method.
   *
   * Returns a structured result instead of throwing for the one anticipated
   * non-completion outcome (`status: 'not-empty'`, S3's BucketNotEmpty, 409)
   * so callers can show a clear message without a try/catch. Every other
   * error (NoSuchBucket, AccessDenied, throttling, ...) propagates raw.
   */
  async deleteBucket(bucketName: string): Promise<DeleteBucketResult> {
    if (!bucketName) {
      throw new Error('deleteBucket: bucketName is required');
    }

    try {
      await this.s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      return { status: 'completed', bucketName, completed: true };
    } catch (err) {
      if (err instanceof S3ServiceException && err.name === 'BucketNotEmpty') {
        return { status: 'not-empty', bucketName, completed: false };
      }
      throw err;
    }
  }

  /**
   * Reads a bucket's tag set. S3 responds with a 404 NoSuchTagSet error -
   * not an empty TagSet - when the bucket has zero tags, so that specific
   * case is translated to `{ tags: [] }`. Every other error (AccessDenied,
   * NoSuchBucket, throttling, ...) propagates raw: silently returning an
   * empty tag set on a permissions failure would make "I can't read this
   * bucket's tags" look exactly like "this bucket has no tags".
   */
  async getBucketTags(bucketName: string): Promise<GetBucketTagsResult> {
    if (!bucketName) {
      throw new Error('getBucketTags: bucketName is required');
    }

    try {
      const response = await this.s3.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
      const tags: BucketTag[] = (response.TagSet ?? []).map((t) => ({
        key: t.Key ?? '',
        value: t.Value ?? '',
      }));
      return { tags };
    } catch (err) {
      if (
        err instanceof S3ServiceException &&
        (err.name === 'NoSuchTagSet' || err.$metadata?.httpStatusCode === 404)
      ) {
        return { tags: [] };
      }
      throw err;
    }
  }

  /**
   * Full replace of a bucket's tag set. Mirrors S3's PutBucketTagging
   * semantics exactly - this replaces every existing tag, it does not
   * merge. See addOrUpdateBucketTags / removeBucketTags for merge/subtract.
   *
   * `tags: []` is routed to DeleteBucketTaggingCommand instead of calling
   * PutBucketTagging with an empty TagSet, since PutBucketTagging's TagSet
   * is a required, non-empty list - DeleteBucketTagging is the documented
   * way to clear all tags.
   */
  async setBucketTags(params: SetBucketTagsParams): Promise<void> {
    const { bucketName, tags } = params;
    if (!bucketName) {
      throw new Error('setBucketTags: bucketName is required');
    }

    try {
      if (tags.length === 0) {
        await this.s3.send(new DeleteBucketTaggingCommand({ Bucket: bucketName }));
        return;
      }

      await this.s3.send(
        new PutBucketTaggingCommand({
          Bucket: bucketName,
          Tagging: { TagSet: tags.map((t) => ({ Key: t.key, Value: t.value })) },
        })
      );
    } catch (err) {
      throw new Error(`Set bucket tags failed for ${bucketName}: ${err}`);
    }
  }

  /**
   * Merges `tags` into the bucket's existing tag set via read-modify-write,
   * since PutBucketTagging always replaces the whole set. Keys present in
   * `tags` overwrite the existing value for that key; every other existing
   * key is preserved. Returns the resulting full tag set so callers don't
   * need a follow-up getBucketTags call.
   *
   * Not atomic: a concurrent tag write between the read and the write here
   * can be lost (last-writer-wins) - S3 bucket tagging has no conditional-
   * write/ETag primitive to guard against that.
   */
  async addOrUpdateBucketTags(params: AddOrUpdateBucketTagsParams): Promise<BucketTag[]> {
    const { bucketName, tags } = params;
    if (!bucketName) {
      throw new Error('addOrUpdateBucketTags: bucketName is required');
    }

    const existing = await this.getBucketTags(bucketName);
    const merged = new Map(existing.tags.map((t) => [t.key, t.value]));
    for (const t of tags) merged.set(t.key, t.value);

    const result: BucketTag[] = Array.from(merged, ([key, value]) => ({ key, value }));

    await this.setBucketTags({ bucketName, tags: result });
    return result;
  }

  /**
   * Removes the given keys from the bucket's existing tag set via
   * read-modify-write. Keys not present are ignored. Removing every tag
   * (remaining set is empty) is routed to DeleteBucketTaggingCommand, via
   * the same branch in setBucketTags.
   */
  async removeBucketTags(params: RemoveBucketTagsParams): Promise<BucketTag[]> {
    const { bucketName, keys } = params;
    if (!bucketName) {
      throw new Error('removeBucketTags: bucketName is required');
    }

    const existing = await this.getBucketTags(bucketName);
    const toRemove = new Set(keys);
    const remaining = existing.tags.filter((t) => !toRemove.has(t.key));

    await this.setBucketTags({ bucketName, tags: remaining });
    return remaining;
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
