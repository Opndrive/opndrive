import { apiS3 } from '@/services/byo-s3-api';
import { PreviewableFile } from '@/types/file-preview';

export interface S3PreviewService {
  getSignedUrl: (file: PreviewableFile) => Promise<string>;
}

/**
 * Service for handling S3 file preview operations
 */
class S3PreviewServiceImpl implements S3PreviewService {
  /**
   * Get a signed URL for file preview
   * @param file - The file to generate a signed URL for
   * @returns Promise<string> - The signed URL
   */
  async getSignedUrl(file: PreviewableFile): Promise<string> {
    try {
      console.log('S3 Preview Service: Requesting signed URL for:', file);

      // Handle both 'key' and 'Key' properties (S3 objects use uppercase Key)
      const fileKey = (file as PreviewableFile & { Key?: string }).Key || file.key || file.name;

      if (!fileKey) {
        throw new Error('No file key found in file object');
      }

      console.log('S3 Preview Service: Using file key:', fileKey);

      const signedUrl = await apiS3.getSignedUrl({
        key: fileKey,
        expiryInSeconds: 3600, // 1 hour expiry for preview
      });

      console.log('S3 Preview Service: Got signed URL:', signedUrl);

      if (!signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL for preview:', error);
      throw new Error(
        error instanceof Error
          ? `Failed to generate signed URL: ${error.message}`
          : 'Failed to generate signed URL for file preview'
      );
    }
  }
}

export const s3PreviewService = new S3PreviewServiceImpl();
