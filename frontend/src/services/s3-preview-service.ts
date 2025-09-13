import { BYOS3ApiProvider } from '@opndrive/s3-api';
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
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  async getSignedUrl(file: PreviewableFile): Promise<string> {
    try {
      // Handle both 'key' and 'Key' properties (S3 objects use uppercase Key)
      const fileKey = (file as PreviewableFile & { Key?: string }).Key || file.key || file.name;

      if (!fileKey) {
        throw new Error('No file key found in file object');
      }

      const signedUrl = await this.api.getSignedUrl({
        key: fileKey,
        expiryInSeconds: 3600, // 1 hour expiry for preview
        isPreview: false,
      });

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

export const createS3PreviewService = (api: BYOS3ApiProvider) => new S3PreviewServiceImpl(api);
