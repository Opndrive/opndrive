'use client';

import { useCallback } from 'react';
import { useUploadStore } from './use-upload-store';
import { UploadMethod } from '../types';
import { apiS3 } from '@/services/byo-s3-api';

// Helper function to get file extension
const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : '';
};

// Helper function to generate S3 key
const generateS3Key = (fileName: string, currentPath: string): string => {
  // Remove leading slash and clean the path
  let cleanPath = currentPath;

  // Remove leading slash if present
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }

  // If path is empty or just root, don't add any prefix
  if (!cleanPath || cleanPath === '' || cleanPath === '/') {
    return fileName;
  }

  // Ensure path ends with slash but doesn't start with one
  if (!cleanPath.endsWith('/')) {
    cleanPath = `${cleanPath}/`;
  }

  return `${cleanPath}${fileName}`;
};

// Helper function to get upload method based on file size and user preferences
const determineUploadMethod = (fileSize: number, userPreference: UploadMethod): UploadMethod => {
  if (userPreference !== 'auto') {
    return userPreference;
  }

  // Auto selection logic
  const MB_5 = 5 * 1024 * 1024;
  const MB_50 = 50 * 1024 * 1024;

  if (fileSize < MB_5) {
    return 'signed-url';
  } else if (fileSize < MB_50) {
    return 'multipart';
  } else {
    return 'multipart-concurrent';
  }
};

interface UseUploadHandlerOptions {
  currentPath: string;
  uploadMethod: UploadMethod;
  onUploadStart?: () => void;
  onUploadComplete?: (success: boolean) => void;
}

export function useUploadHandler({
  currentPath = '',
  uploadMethod = 'auto',
  onUploadStart,
  onUploadComplete,
}: UseUploadHandlerOptions) {
  const { addUploadItem, updateProgress, updateItemStatus } = useUploadStore();

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      const fileArray = Array.from(files);

      // Add all files to queue first
      const itemIds: string[] = [];
      for (const file of fileArray) {
        const extension = getFileExtension(file.name);

        const itemId = addUploadItem({
          name: file.name,
          type: 'file',
          size: file.size,
          progress: 0,
          status: 'pending',
          file: file,
          destination: currentPath,
          extension,
        });

        itemIds.push(itemId);
      }

      // Process uploads sequentially (queued)
      for (let i = 0; i < itemIds.length; i++) {
        const itemId = itemIds[i];
        const file = fileArray[i];
        const selectedMethod = determineUploadMethod(file.size, uploadMethod);

        try {
          updateItemStatus(itemId, 'uploading');

          const s3Key = generateS3Key(file.name, currentPath);
          await uploadFileToS3(itemId, file, s3Key, selectedMethod, updateProgress);

          updateItemStatus(itemId, 'completed');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          updateItemStatus(itemId, 'error', errorMessage);
        }
      }

      onUploadComplete?.(true);
    },
    [
      currentPath,
      uploadMethod,
      addUploadItem,
      updateProgress,
      updateItemStatus,
      onUploadStart,
      onUploadComplete,
    ]
  );

  const handleFolderUpload = useCallback(
    async (files: FileList) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      const fileArray = Array.from(files);
      const folderName = extractFolderName(fileArray);

      if (!folderName) {
        return;
      }

      const itemId = addUploadItem({
        name: folderName,
        type: 'folder',
        size: fileArray.reduce((total, file) => total + file.size, 0),
        progress: 0,
        status: 'pending',
        files: fileArray,
        destination: currentPath,
        uploadedFiles: 0,
        totalFiles: fileArray.length,
      });

      try {
        updateItemStatus(itemId, 'uploading');

        // Upload files sequentially (queued approach for folder)
        let uploadedCount = 0;
        for (const file of fileArray) {
          const relativePath = file.webkitRelativePath || file.name;
          const s3Key = generateS3Key(relativePath, currentPath);
          const selectedMethod = determineUploadMethod(file.size, uploadMethod);

          await uploadFolderFileToS3(file, s3Key, selectedMethod);

          uploadedCount++;
          const progress = (uploadedCount / fileArray.length) * 100;

          updateProgress({
            itemId,
            progress,
            uploadedFiles: uploadedCount,
            totalFiles: fileArray.length,
          });
        }

        updateItemStatus(itemId, 'completed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Folder upload failed';
        updateItemStatus(itemId, 'error', errorMessage);
      }

      onUploadComplete?.(true);
    },
    [
      currentPath,
      uploadMethod,
      addUploadItem,
      updateProgress,
      updateItemStatus,
      onUploadStart,
      onUploadComplete,
    ]
  );

  return {
    handleFileUpload,
    handleFolderUpload,
  };
}

// Helper function to extract folder name from file list
function extractFolderName(files: File[]): string | null {
  if (files.length === 0) return null;

  const firstFile = files[0];

  // Check if files have webkitRelativePath (folder upload)
  if (!firstFile.webkitRelativePath) {
    return null;
  }

  const pathParts = firstFile.webkitRelativePath.split('/');
  const folderName = pathParts[0];

  if (!folderName) {
    return null;
  }

  return folderName;
}

// Real S3 upload functions
async function uploadFileToS3(
  itemId: string,
  file: File,
  s3Key: string,
  method: UploadMethod,
  updateProgress: (progress: { itemId: string; progress: number }) => void
): Promise<void> {
  switch (method) {
    case 'signed-url': {
      // For now, use multipart as it's more reliable
      await apiS3.uploadMultipart({
        file: file,
        key: s3Key,
        onProgress: (progress: number) => updateProgress({ itemId, progress }),
      });
      break;
    }

    case 'multipart': {
      await apiS3.uploadMultipart({
        file: file,
        key: s3Key,
        onProgress: (progress: number) => updateProgress({ itemId, progress }),
      });
      break;
    }

    case 'multipart-concurrent': {
      const uploader = apiS3.uploadMultipartParallely({
        file: file,
        key: s3Key,
        partSizeMB: 5,
        concurrency: 3,
        onProgress: (progress: number) => updateProgress({ itemId, progress }),
      });
      await uploader.start({
        file: file,
        key: s3Key,
        partSizeMB: 5,
        concurrency: 3,
        onProgress: (progress: number) => updateProgress({ itemId, progress }),
      });
      break;
    }

    default: {
      // Auto method - use multipart for reliability
      await apiS3.uploadMultipart({
        file: file,
        key: s3Key,
        onProgress: (progress: number) => updateProgress({ itemId, progress }),
      });
      break;
    }
  }
}

async function uploadFolderFileToS3(
  file: File,
  s3Key: string,
  _method: UploadMethod
): Promise<void> {
  // Always use multipart for reliability
  await apiS3.uploadMultipart({
    file: file,
    key: s3Key,
  });
}
