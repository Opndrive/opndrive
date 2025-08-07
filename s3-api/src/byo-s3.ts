import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BaseS3ApiProvider,
  Credentials,
  DirectoryStructure,
  PresignedUploadParams,
  userTypes,
} from './core';
import {
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  PutObjectCommandInput,
  PutObjectCommand,
  __MetadataBearer,
} from '@aws-sdk/client-s3';

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
}
