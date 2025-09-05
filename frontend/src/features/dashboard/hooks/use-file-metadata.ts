import { useState, useEffect } from 'react';
import { apiS3 } from '@/services/byo-s3-api';
import { FileItem } from '@/features/dashboard/types/file';
import { HeadObjectCommandOutput } from '@aws-sdk/client-s3';

export interface FileMetadata {
  size: string;
  rawSize: number;
  lastModified: Date | null;
  created: Date | null;
  contentType: string;
  etag: string;
  storageClass: string;
  location: string;
  owner: string;
}

export const useFileMetadata = (file: FileItem | null) => {
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setMetadata(null);
      setError(null);
      return;
    }

    const fetchMetadata = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const key = file.Key || file.name;
        const s3Metadata: HeadObjectCommandOutput | null = await apiS3.fetchMetadata(key);

        if (s3Metadata) {
          const metadata: FileMetadata = {
            size:
              typeof file.size === 'object'
                ? `${file.size.value} ${file.size.unit}`
                : file.size || formatBytes(s3Metadata.ContentLength || 0),
            rawSize: s3Metadata.ContentLength || 0,
            lastModified: s3Metadata.LastModified || file.lastModified || null,
            created: s3Metadata.LastModified || file.lastModified || null,
            contentType: s3Metadata.ContentType || 'Unknown',
            etag: s3Metadata.ETag?.replace(/"/g, '') || '',
            storageClass: s3Metadata.StorageClass || 'STANDARD',
            location: 'My Drive',
            owner: 'me',
          };

          setMetadata(metadata);
        } else {
          const fallbackMetadata: FileMetadata = {
            size:
              typeof file.size === 'object'
                ? `${file.size.value} ${file.size.unit}`
                : file.size || '0 B',
            rawSize: 0,
            lastModified: file.lastModified || null,
            created: file.lastModified || null,
            contentType: getContentTypeFromExtension(file.extension || ''),
            etag: '',
            storageClass: 'STANDARD',
            location: 'My Drive',
            owner: 'me',
          };

          setMetadata(fallbackMetadata);
        }
      } catch (err) {
        console.error('Failed to fetch file metadata:', err);
        setError('Failed to load file details');

        const fallbackMetadata: FileMetadata = {
          size:
            typeof file.size === 'object'
              ? `${file.size.value} ${file.size.unit}`
              : file.size || '0 B',
          rawSize: 0,
          lastModified: file.lastModified || null,
          created: file.lastModified || null,
          contentType: getContentTypeFromExtension(file.extension || ''),
          etag: '',
          storageClass: 'STANDARD',
          location: 'My Drive',
          owner: 'me',
        };

        setMetadata(fallbackMetadata);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [file]);

  return { metadata, isLoading, error };
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getContentTypeFromExtension = (extension: string): string => {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
  };

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
};
