/**
 * Core API interface definition for s3 bucket access for opndrive
 */

import { HeadObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import {
  Credentials,
  DirectoryStructure,
  DownloadFileParams,
  logTypes,
  MultipartUploadParallelParams,
  MultipartUploadParams,
  PresignedUploadParams,
  SignedUrlParams,
  userTypes,
} from './types';
import { MultipartUploader } from '@/utils/multipartUploader';

/**
 * Core API class
 */
export abstract class BaseS3ApiProvider {
  protected credentials: Credentials;
  protected s3: S3Client;

  constructor(creds: Credentials) {
    this.credentials = creds;
    this.s3 = new S3Client({
      region: this.credentials.region,
      credentials: {
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
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

  abstract uploadMultipart(params: MultipartUploadParams): Promise<void>;

  abstract uploadMultipartParallely(params: MultipartUploadParallelParams): MultipartUploader;

  abstract getSignedUrl(params: SignedUrlParams): Promise<string>;

  abstract downloadFile(key: DownloadFileParams): Promise<Blob | ArrayBuffer | Buffer>;
}
