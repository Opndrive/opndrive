import { PreviewableFile, getFilePreviewType, FilePreviewType } from '@/types/file-preview';
import { apiS3 } from '@/services/byo-s3-api';

export interface FilePreviewData {
  url?: string; // For images, videos, audio
  content?: string; // For text-based files
  blob?: Blob; // For PDFs and other binary content
  metadata?: {
    pages?: number; // For PDFs
    dimensions?: { width: number; height: number }; // For images/videos
    encoding?: string; // For text files
    language?: string; // For code files
  };
}

export interface PreviewOptions {
  maxSize?: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

class FilePreviewService {
  private cache = new Map<string, FilePreviewData>();

  async getFilePreview(
    file: PreviewableFile,
    options: PreviewOptions = {}
  ): Promise<FilePreviewData> {
    const cacheKey = `${file.key}-${file.size}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const fileType = getFilePreviewType(file.name);
    let previewData: FilePreviewData;

    try {
      switch (fileType) {
        case 'image':
          previewData = await this.getImagePreview(file, options);
          break;
        case 'pdf':
          previewData = await this.getPDFPreview(file, options);
          break;
        case 'document':
        case 'code':
          previewData = await this.getTextPreview(file, fileType, options);
          break;
        case 'video':
        case 'audio':
          previewData = await this.getMediaPreview(file, options);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Cache the result
      this.cache.set(cacheKey, previewData);
      return previewData;
    } catch (error) {
      console.error('Error getting file preview:', error);
      throw error;
    }
  }

  private async getImagePreview(
    file: PreviewableFile,
    _options: PreviewOptions
  ): Promise<FilePreviewData> {
    const fileKey = file.key || file.name;
    if (!fileKey) {
      throw new Error('File key or name is required');
    }
    const signedUrl = await this.getSignedUrl(fileKey);

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve({
          url: signedUrl,
          metadata: {
            dimensions: { width: img.width, height: img.height },
          },
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = signedUrl;
    });
  }

  private async getPDFPreview(
    file: PreviewableFile,
    _options: PreviewOptions
  ): Promise<FilePreviewData> {
    const blob = await this.downloadFileAsBlob(file, _options);

    return {
      blob,
      metadata: {
        // PDF page count will be determined by the PDF viewer component
      },
    };
  }

  private async getTextPreview(
    file: PreviewableFile,
    fileType: FilePreviewType,
    _options: PreviewOptions
  ): Promise<FilePreviewData> {
    const blob = await this.downloadFileAsBlob(file, _options);
    const content = await blob.text();

    // Detect language for code files
    let language = '';
    if (fileType === 'code') {
      language = this.detectCodeLanguage(file.name);
    }

    return {
      content,
      metadata: {
        encoding: 'utf-8',
        language,
      },
    };
  }

  private async getMediaPreview(
    file: PreviewableFile,
    _options: PreviewOptions
  ): Promise<FilePreviewData> {
    const fileKey = file.key || file.name;
    if (!fileKey) {
      throw new Error('File key or name is required');
    }
    const signedUrl = await this.getSignedUrl(fileKey);

    return {
      url: signedUrl,
    };
  }

  private async getSignedUrl(key: string): Promise<string> {
    if (!key) {
      throw new Error('File key is required');
    }
    // Get signed URL with 1 hour expiration for preview
    return await apiS3.getSignedUrl({ key, expiryInSeconds: 3600 });
  }

  private async downloadFileAsBlob(file: PreviewableFile, options: PreviewOptions): Promise<Blob> {
    const fileKey = file.key || file.name;
    if (!fileKey) {
      throw new Error('File key or name is required');
    }
    return (await apiS3.downloadFile({
      key: fileKey,
      onProgress: options.onProgress,
    })) as Blob;
  }

  private detectCodeLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      rust: 'rust',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
    };

    return languageMap[ext || ''] || 'plaintext';
  }

  clearCache(): void {
    this.cache.clear();
  }

  removeCacheEntry(fileKey: string): void {
    // Remove all cache entries for this file
    const keysToRemove = Array.from(this.cache.keys()).filter((key) => key.startsWith(fileKey));
    keysToRemove.forEach((key) => this.cache.delete(key));
  }
}

export const filePreviewService = new FilePreviewService();
