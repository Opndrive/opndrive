import { apiS3 } from '@/services/byo-s3-api';
import { UploadManager } from '@opndrive/s3-api';

export const uploadManager = UploadManager.getInstance({
  s3: apiS3.getS3Client(),
  bucket: apiS3.getBucketName(),
  prefix: apiS3.getPrefix(),
  maxConcurrency: 2, // Max 2 files uploading simultaneously
});
