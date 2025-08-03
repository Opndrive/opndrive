import { BaseS3ApiProvider, DiretoryStrucure } from './core';
import { S3Client, ListObjectsV2Command, ListObjectsV2CommandInput } from '@aws-sdk/client-s3';

export class BYOS3ApiProvider extends BaseS3ApiProvider {
  async fetchDirectoryStructure(
    prefix: string | undefined | null,
    maxKeys: number = 50,
    token?: string
  ): Promise<DiretoryStrucure> {
    try {
      const s3 = new S3Client({
        region: this.credentials.region,
        credentials: {
          accessKeyId: this.credentials.accessKeyId,
          secretAccessKey: this.credentials.secretAccessKey,
        },
      });

      const input: ListObjectsV2CommandInput = {
        Bucket: this.credentials.bucketName,
        Prefix: prefix ?? this.credentials.prefix,
        MaxKeys: maxKeys,
        ContinuationToken: token,
        Delimiter: '/',
      };

      const command = new ListObjectsV2Command(input);
      const response = await s3.send(command);

      return {
        files: response.Contents ?? [],
        folders: response.CommonPrefixes ?? [],
        nextToken: response.NextContinuationToken,
        isTruncated: response.IsTruncated,
      };
    } catch (_error) {
      return {
        files: [],
        folders: [],
        nextToken: undefined,
        isTruncated: undefined,
      };
    }
  }
}
