import { useState, useCallback } from 'react';
import { FileItem } from '../types/file';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { getContentTypeForS3 } from '@/config/file-extensions';

export function useMultiShareDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const { apiS3 } = useAuthGuard();

  const openMultiShareDialog = useCallback((files: FileItem[]) => {
    setCurrentFiles(files);
    setIsOpen(true);
  }, []);

  const closeMultiShareDialog = useCallback(() => {
    setIsOpen(false);
    setCurrentFiles([]);
  }, []);

  const generateShareLinks = useCallback(
    async (
      files: FileItem[],
      durationInSeconds: number
    ): Promise<Array<{ file: FileItem; url?: string; error?: string }>> => {
      if (!apiS3) {
        return files.map((file) => ({
          file,
          error: 'S3 API not available',
        }));
      }

      const linkPromises = files.map(async (file) => {
        try {
          if (!file.Key) {
            return {
              file,
              error: 'Invalid file key',
            };
          }

          const signedUrl = await apiS3.getSignedUrl({
            key: file.Key,
            expiryInSeconds: durationInSeconds,
            isPreview: true,
            responseContentType: getContentTypeForS3(file.Key),
          });

          return {
            file,
            url: signedUrl,
          };
        } catch (error) {
          console.error(`Failed to generate link for ${file.name}:`, error);
          return {
            file,
            error: 'Failed to generate share link',
          };
        }
      });

      return Promise.all(linkPromises);
    },
    [apiS3]
  );

  return {
    isOpen,
    currentFiles,
    openMultiShareDialog,
    closeMultiShareDialog,
    generateShareLinks,
  };
}
