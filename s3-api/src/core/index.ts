/**
 * Core API interface definition for s3 bucket access for opndrive
 */

import {
  HeadObjectCommandOutput,
  ObjectIdentifier,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
  Credentials,
  DeleteBatchResult,
  DirectoryStructure,
  DownloadFileParams,
  ListBucketParams,
  ListBucketResult,
  logTypes,
  MoveFileParams,
  MultipartUploadParams,
  PresignedUploadParams,
  RenameFileParams,
  RenameFolderParams,
  RenameFolderResult,
  SearchParams,
  SearchResult,
  SignedUrlParams,
  userTypes,
} from './types.js';
import { MultipartUploader } from '@/utils/multipartUploader.js';

/**
 * Core API class
 */
export abstract class BaseS3ApiProvider {
  protected credentials: Credentials;
  protected s3: S3Client;

  constructor(creds: Credentials) {
    this.credentials = creds;

    const s3Config: S3ClientConfig = {
      region: this.credentials.region,
      credentials: {
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // Retry policy lives here and ONLY here. The SDK's standard strategy
      // already retries throttling (SlowDown), 5xx, and network failures with
      // its own exponential backoff, so wrapping individual send() calls in a
      // second retry layer multiplies attempts (4 outer x 3 inner = 12 requests
      // per object) and fights the SDK's internal rate limiter. Bulk operations
      // like folder rename and batch delete issue thousands of requests, so a
      // slightly higher ceiling than the default 3 is worth the slower failure.
      maxAttempts: 5,
    };

    if (this.credentials.endpoint) {
      s3Config.endpoint = this.credentials.endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3 = new S3Client(s3Config);
  }

  /**
   *
   * @param userType user role
   * @param logType type of log
   * @param message user message
   * @param error user error
   * @param data any kind of data
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  debugLog(
    userType: userTypes,
    logType: logTypes,
    message?: string | undefined | null,
    error?: string | Error | undefined | null,
    data?: any
  ): void {
    const date = new Date();
    console.log(`${date.toISOString()} [${userType}-S3]:`);
    switch (logType) {
      case 'log':
        console.log(message, data, '\n');
        break;
      case 'error':
        console.error(error, '\n');
        break;
      case 'warn':
        console.warn(message, '\n');
        break;
      case 'table':
        console.table(data);
        console.log();
        break;
      case 'dir':
        console.dir(data, { depth: null });
        console.log();
        break;
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  abstract fetchDirectoryStructure(
    prefix: string | undefined | null,
    maxKeys: number,
    token?: string
  ): Promise<DirectoryStructure>;

  abstract fetchMetadata(path: string): Promise<HeadObjectCommandOutput | null>;

  abstract uploadWithPreSignedUrl(params: PresignedUploadParams): Promise<string | null>;

  abstract uploadMultipartParallely(params: MultipartUploadParams): MultipartUploader;

  abstract getSignedUrl(params: SignedUrlParams): Promise<string>;

  abstract downloadFile(params: DownloadFileParams): Promise<Blob | ArrayBuffer | Buffer>;

  abstract deleteFile(key: string): Promise<void>;

  abstract moveFile(params: MoveFileParams): Promise<void>;

  abstract createFolder(key: string): Promise<void>;

  abstract renameFile(params: RenameFileParams): Promise<boolean>;

  abstract renameFolder(params: RenameFolderParams): Promise<RenameFolderResult>;

  abstract search(params: SearchParams): Promise<SearchResult>;

  abstract listFromPrefix(prefix: string): Promise<string[]>;

  abstract deleteBatch(batch: ObjectIdentifier[]): Promise<DeleteBatchResult>;

  abstract getBucketName(): string;

  abstract getPrefix(): string;

  abstract getRegion(): string;

  abstract getBuckets(params: ListBucketParams): Promise<ListBucketResult>;

  abstract getS3Client(): S3Client;
}
