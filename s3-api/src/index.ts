import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Credentials,
  DirectoryStructure,
  DownloadFileParams,
  MoveFileParams,
  MultipartUploadConfig,
  MultipartUploadParams,
  PresignedUploadParams,
  RenameFileParams,
  RenameFolderParams,
  SearchParams,
  SearchResult,
  SignedUrlParams,
  userTypes,
} from './core/types.js';
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

  async deleteBatch(batch: ObjectIdentifier[]): Promise<void> {
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.credentials.bucketName,
        Delete: {
          Objects: batch,
          Quiet: true,
        },
      })
    );
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

  async renameFolder(params: RenameFolderParams): Promise<{ total: number; processed: number }> {
    const bucket = this.credentials.bucketName;

    const oldPrefix = params.oldPrefix.endsWith('/') ? params.oldPrefix : params.oldPrefix + '/';
    const newPrefix = params.newPrefix.endsWith('/') ? params.newPrefix : params.newPrefix + '/';

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

    const total = allKeys.length;
    let processed = 0;

    for (const key of allKeys) {
      const newKey = key.replace(oldPrefix, newPrefix);

      try {
        await this.s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${encodeURIComponent(key)}`,
            Key: newKey,
          })
        );

        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );

        processed++;
        params.onProgress?.({ total, processed, currentKey: key, newKey });
      } catch (err) {
        console.error(`Failed to move ${key}:`, err);
        throw err;
      }
    }

    return { total, processed };
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
export * from './core/types.js';
