import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Credentials,
  DirectoryStructure,
  MultipartUploadParams,
  PresignedUploadParams,
  userTypes,
} from './core/types';
import {
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  PutObjectCommandInput,
  PutObjectCommand,
  __MetadataBearer,
  CreateMultipartUploadCommand,
  CompletedPart,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { BaseS3ApiProvider } from './core';

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
    } catch (error) {
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

  async uploadMultipart(params: MultipartUploadParams): Promise<void> {
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: this.credentials.bucketName,
      Key: params.key,
    });
    const { UploadId } = await this.s3.send(createCommand);

    if (!UploadId) throw new Error('Failed to initiate multipart upload');

    const partSize = (params.partSizeMB ? params.partSizeMB : 5) * 1024 * 1024;
    const totalParts = Math.ceil(params.file.size / partSize);
    const completedParts: CompletedPart[] = [];

    try {
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, params.file.size);
        const blobPart = params.file.slice(start, end);

        const uploadPartCommand = new UploadPartCommand({
          Bucket: this.credentials.bucketName,
          Key: params.key,
          UploadId,
          PartNumber: partNumber,
          Body: blobPart,
        });

        const response = await this.s3.send(uploadPartCommand);

        completedParts.push({
          ETag: response.ETag,
          PartNumber: partNumber,
        });

        if (params.onProgress) {
          params.onProgress((partNumber / totalParts) * 100);
        }
      }

      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: this.credentials.bucketName,
        Key: params.key,
        UploadId,
        MultipartUpload: {
          Parts: completedParts,
        },
      });

      await this.s3.send(completeCommand);
    } catch (error) {
      console.log(error);
      await this.s3.send(
        new AbortMultipartUploadCommand({
          Bucket: this.credentials.bucketName,
          Key: params.key,
          UploadId,
        })
      );
      throw error;
    }
  }
}
