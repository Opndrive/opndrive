import { _Object, CommonPrefix } from '@aws-sdk/client-s3';

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

export interface PresignedUploadParams {
  key: string;
  expiresInSeconds: number;
}

export type logTypes = 'warn' | 'log' | 'error' | 'table' | 'dir';
export type userTypes = 'BYO';

export interface MultipartUploadParams {
  file: File;
  key: string;
  partSizeMB?: number; // default = 5MB
  onProgress?: (progress: number) => void;
}

export interface SignedUrlParams {
  key: string;
  expiryInSeconds: number;
}
