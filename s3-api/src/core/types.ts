import { MultipartUploader } from '@/utils/multipartUploader.js';
import { _Object, CommonPrefix, S3Client } from '@aws-sdk/client-s3';

export interface Credentials {
  region: string; //AWS region
  prefix: string; // Prefix (used when the user has access to only specific prefixes)
  accessKeyId: string; // AWS Access key ID
  secretAccessKey: string; // AWS Access Secret key
  bucketName: string; //AWS S3 bucket name
  endpoint?: string;
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
  key: string;
  fileName: string;
  partSizeMB: number;
  concurrency: number;
}

export interface MultipartUploadConfig extends MultipartUploadParams {
  s3: S3Client;
  bucket: string;
  key: string;
  fileName: string;
  partSizeMB: number;
  concurrency: number;
}

export interface SignedUrlParams {
  key: string;
  expiryInSeconds: number;
  isPreview: boolean;
  responseContentType?: string;
  /**
   * Name the browser should save the file as. Only honoured when `isPreview` is
   * false; sets `Content-Disposition: attachment` on the presigned response so
   * the name survives the cross-origin hop that makes `<a download>` a no-op.
   */
  downloadFilename?: string;
}

export interface DownloadFileParams {
  key: string;
  onProgress?: (progress: number, loaded: number, total: number) => void;
}

export interface MoveFileParams {
  oldKey: string;
  newKey: string;
}

export interface RenameFileParams {
  basePath: string;
  oldName: string;
  newName: string;
}

export interface RenameFolderParams {
  oldPrefix: string;
  newPrefix: string;
  onProgress?: (progress: RenameFolderProgress) => void;
}

export interface RenameFolderProgress {
  phase: 'copying' | 'verifying' | 'deleting';
  total: number;
  processed: number;
  currentKey?: string;
  newKey?: string;
}

/** A single object that could not be copied or deleted while renaming a folder. */
export interface RenameFolderError {
  key: string;
  code?: string;
  message?: string;
}

/**
 * - `completed`      - copied, verified, and old keys removed. Fully done.
 * - `copied-not-cleaned` - every object is present and correct at the NEW
 *   location, but some old objects could not be deleted. The user's data is
 *   safe and complete; this is a cleanup problem, NOT a failed rename, and
 *   must not be reported as one.
 * - `failed`         - the copy did not fully succeed, so nothing was deleted.
 *   The source prefix is intact and the same rename can safely be retried.
 */
export type RenameFolderStatus = 'completed' | 'copied-not-cleaned' | 'failed';

export interface RenameFolderResult {
  status: RenameFolderStatus;
  totalKeys: number;
  /**
   * Objects successfully written to the new prefix.
   *
   * When `status` is 'failed' this doubles as the count of orphaned copies
   * left at the destination - harmless (a retry overwrites them, since
   * CopyObject is idempotent) but worth surfacing so the user knows they are
   * there.
   */
  copiedKeys: number;
  deletedKeys: number;
  errors: RenameFolderError[];
  /** Convenience for `status === 'completed'`. */
  completed: boolean;
}

/**
 * A single object that S3 refused to delete within a DeleteObjects call.
 * DeleteObjects returns 200 even when individual keys fail, so these must be
 * inspected by the caller - they are not thrown.
 */
export interface DeleteBatchError {
  key: string;
  /** Present when the bucket is versioned; the error is meaningless without it. */
  versionId?: string;
  code?: string;
  message?: string;
}

export interface DeleteBatchResult {
  /** How many keys were sent in the request. */
  requested: number;
  /**
   * How many were removed. Derived as `requested - errors.length`: Quiet mode
   * returns no success list, so this is an inference and assumes S3 emits at
   * most one error entry per requested key. Callers passing duplicate keys will
   * see it drift.
   */
  deleted: number;
  /** Per-object failures. Empty on a fully successful batch. */
  errors: DeleteBatchError[];
}

export interface SearchParams {
  prefix: string;
  searchTerm: string;
  nextToken: string | undefined;
}

export interface SearchResult {
  files: _Object[];
  totalFiles: number;
  folders: _Object[];
  totalFolders: number;
  totalKeys: number;
  nextToken?: string;
  isTruncated?: boolean;
}

// Uploader

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  uploader: MultipartUploader;
  error?: string;
  config: {
    key: string;
    folderId?: string;
  };
}

export type UploadManagerConfig = {
  s3: S3Client;
  bucket: string;
  prefix: string; // Base prefix for all uploads
  maxConcurrency?: number;
  partSizeMB?: number; // Default part size for all uploads
};

// For the event emitter
export type UploadEvent = 'statusChange' | 'progress';
export type EventPayload = {
  id: string;
  status: UploadStatus;
  progress: number;
  error?: string;
};

export type EventListener = (payload: EventPayload) => void;
