/**
 * Core API interface definition for s3 bucket access for opndrive
 */

import { _Object, CommonPrefix } from '@aws-sdk/client-s3';

export interface Credentials {
  region: string; //AWS region
  prefix: string; // Prefix (used when the user has access to only specific prefixes)
  accessKeyId: string; // AWS Access key ID
  secretAccessKey: string; // AWS Access Secret key
  bucketName: string; //AWS S3 bucket name
}

export interface DiretoryStrucure {
  files: _Object[];
  folders: CommonPrefix[];
  nextToken: string | undefined;
  isTruncated: boolean | undefined;
}

/**
 * Core API class
 */
export abstract class BaseS3ApiProvider {
  protected credentials: Credentials;

  constructor(creds: Credentials) {
    this.credentials = creds;
  }

  abstract fetchDirectoryStructure(
    prefix: string | undefined | null,
    maxKeys: number,
    token?: string
  ): Promise<DiretoryStrucure>;
}
