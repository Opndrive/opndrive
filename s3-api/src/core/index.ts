/**
 * Core API interface definition for s3 bucket access for opndrive
 */

import { _Object, CommonPrefix, HeadObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';

export interface Credentials {
  region: string; //AWS region
  prefix: string; // Prefix (used when the user has access to only specific prefixes)
  accessKeyId: string; // AWS Access key ID
  secretAccessKey: string; // AWS Access Secret key
  bucketName: string; //AWS S3 bucket name
}

export interface DirectoryStructure {
  files: _Object[];
  folders: CommonPrefix[];
  nextToken: string | undefined;
  isTruncated: boolean | undefined;
}

export type logTypes = 'warn' | 'log' | 'error' | 'table' | 'dir';
export type userTypes = 'BYO';

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

  abstract fetchMetadata(prefix: string): Promise<HeadObjectCommandOutput | null>;
}
