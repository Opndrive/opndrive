'use client';

import { useCallback } from 'react';
import { useUploadStore } from './use-upload-store';
import { UploadMethod } from '../types';
import { apiS3 } from '@/services/byo-s3-api';
import { generateUniqueFileName, generateUniqueFolderName } from '../utils/unique-filename';
import { useDriveStore } from '@/context/data-context';

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

// Helper function to check if file/folder already exists
const checkForDuplicates = async (fileName: string, currentPath: string): Promise<boolean> => {
  try {
    const s3Key = generateS3Key(fileName, currentPath);
    const metadata = await apiS3.fetchMetadata(s3Key);
    return metadata !== null; // Returns true if file exists
  } catch {
    // If there's an error checking, assume it doesn't exist
    return false;
  }
};

// Helper function to check if folder already exists
const checkForFolderDuplicates = async (
  folderName: string,
  currentPath: string
): Promise<boolean> => {
  try {
    // Generate the folder prefix that would be used for this folder
    let folderPrefix = currentPath;

    // Remove leading slash if present
    if (folderPrefix.startsWith('/')) {
      folderPrefix = folderPrefix.slice(1);
    }

    // If path is empty or just root, don't add any prefix
    if (!folderPrefix || folderPrefix === '' || folderPrefix === '/') {
      folderPrefix = `${folderName}/`;
    } else {
      // Ensure path ends with slash but doesn't start with one
      if (!folderPrefix.endsWith('/')) {
        folderPrefix = `${folderPrefix}/`;
      }
      folderPrefix = `${folderPrefix}${folderName}/`;
    }

    // Use fetchDirectoryStructure to check if any objects exist with this prefix
    const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1); // Just check for 1 object

    // If we find any objects (files or folders) with this prefix, the folder exists
    return result.files.length > 0 || result.folders.length > 0;
  } catch {
    // If there's an error checking, assume folder doesn't exist
    return false;
  }
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
  const {
    addUploadItem,
    updateProgress,
    updateItemStatus,
    updateItemName,
    showDuplicateDialog,
    hideDuplicateDialog,
  } = useUploadStore();

  const { refreshCurrentData } = useDriveStore();

  // Helper function to process individual file upload
  const processFileUpload = useCallback(
    async (file: File, itemId: string, customName?: string) => {
      const selectedMethod = determineUploadMethod(file.size, uploadMethod);
      const s3Key = generateS3Key(customName || file.name, currentPath);

      try {
        updateItemStatus(itemId, 'uploading');

        if (selectedMethod === 'multipart-concurrent') {
          await apiS3.uploadMultipartParallely({
            file,
            key: s3Key,
            partSizeMB: 5,
            concurrency: 3,
            onProgress: (progress: number) => {
              updateProgress({ itemId, progress });
            },
          });
        } else {
          await apiS3.uploadMultipart({
            file,
            key: s3Key,
            onProgress: (progress: number) => {
              updateProgress({ itemId, progress });
            },
          });
        }

        updateItemStatus(itemId, 'completed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        updateItemStatus(itemId, 'error', errorMessage);
      }
    },
    [currentPath, uploadMethod, updateItemStatus, updateProgress]
  );

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      const fileArray = Array.from(files);

      // Process files one by one, checking for duplicates
      for (const file of fileArray) {
        const extension = getFileExtension(file.name);

        // Check if file already exists
        const isDuplicate = await checkForDuplicates(file.name, currentPath);

        if (isDuplicate) {
          // Pause queue and show duplicate dialog
          const itemId = addUploadItem({
            name: file.name,
            type: 'file',
            size: file.size,
            progress: 0,
            status: 'paused',
            file: file,
            destination: currentPath,
            extension,
          });

          // Show duplicate dialog and wait for user decision
          await new Promise<void>((resolve) => {
            showDuplicateDialog(
              {
                id: itemId,
                name: file.name,
                type: 'file',
                size: file.size,
                progress: 0,
                status: 'paused',
                file: file,
                destination: currentPath,
                extension,
              },
              // onReplace
              async () => {
                updateItemStatus(itemId, 'pending');
                await processFileUpload(file, itemId);
                hideDuplicateDialog();
                resolve();
              },
              // onKeepBoth
              async () => {
                const uniqueName = await generateUniqueFileName(file.name, currentPath);
                // Create new file with unique name
                const newFile = new File([file], uniqueName, { type: file.type });
                // Update the item name
                updateItemStatus(itemId, 'pending');
                await processFileUpload(newFile, itemId, uniqueName);
                hideDuplicateDialog();
                resolve();
              }
            );
          });
        } else {
          // No duplicate, proceed with normal upload
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

          await processFileUpload(file, itemId);
        }
      }

      // Refresh data after all files are uploaded successfully
      try {
        await refreshCurrentData();
      } catch {
        // Don't fail the upload if refresh fails
      }

      onUploadComplete?.(true);
    },
    [
      currentPath,
      onUploadStart,
      onUploadComplete,
      addUploadItem,
      updateItemStatus,
      showDuplicateDialog,
      hideDuplicateDialog,
      processFileUpload,
      refreshCurrentData,
    ]
  );

  const handleFolderUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      const fileArray = Array.from(files);

      // Extract folder structure from webkitRelativePath
      const folderMap = new Map<string, File[]>();
      const folderSizes = new Map<string, number>();

      fileArray.forEach((file) => {
        if (file.webkitRelativePath) {
          const pathParts = file.webkitRelativePath.split('/');
          const folderName = pathParts[0];

          if (!folderMap.has(folderName)) {
            folderMap.set(folderName, []);
            folderSizes.set(folderName, 0);
          }

          folderMap.get(folderName)?.push(file);
          folderSizes.set(folderName, (folderSizes.get(folderName) || 0) + file.size);
        }
      });

      // Process each folder
      for (const [folderName, folderFiles] of folderMap) {
        const isDuplicate = await checkForFolderDuplicates(folderName, currentPath);
        const folderSize = folderSizes.get(folderName) || 0;

        if (isDuplicate) {
          // Show duplicate dialog for folder
          const itemId = addUploadItem({
            name: folderName,
            type: 'folder',
            size: folderSize,
            progress: 0,
            status: 'paused',
            files: folderFiles,
            destination: currentPath,
            totalFiles: folderFiles.length,
            uploadedFiles: 0,
          });

          await new Promise<void>((resolve) => {
            showDuplicateDialog(
              {
                id: itemId,
                name: folderName,
                type: 'folder',
                size: folderSize,
                progress: 0,
                status: 'paused',
                files: folderFiles,
                destination: currentPath,
                totalFiles: folderFiles.length,
                uploadedFiles: 0,
              },
              // onReplace
              async () => {
                try {
                  updateItemStatus(itemId, 'pending');
                  await processFolderUpload(folderFiles, itemId, folderName);
                  hideDuplicateDialog();
                } catch (error) {
                  updateItemStatus(
                    itemId,
                    'error',
                    error instanceof Error ? error.message : 'Upload failed'
                  );
                  hideDuplicateDialog();
                }
                resolve();
              },
              // onKeepBoth
              async () => {
                try {
                  const uniqueFolderName = await generateUniqueFolderName(folderName, currentPath);

                  // Update the item name to show the new unique name
                  updateItemName(itemId, uniqueFolderName);
                  updateItemStatus(itemId, 'pending');
                  await processFolderUpload(folderFiles, itemId, uniqueFolderName);
                  hideDuplicateDialog();
                } catch (error) {
                  updateItemStatus(
                    itemId,
                    'error',
                    error instanceof Error ? error.message : 'Upload failed'
                  );
                  hideDuplicateDialog();
                }
                resolve();
              }
            );
          });
        } else {
          // No duplicate, proceed with normal upload
          const itemId = addUploadItem({
            name: folderName,
            type: 'folder',
            size: folderSize,
            progress: 0,
            status: 'pending',
            files: folderFiles,
            destination: currentPath,
            totalFiles: folderFiles.length,
            uploadedFiles: 0,
          });

          await processFolderUpload(folderFiles, itemId, folderName);
        }
      }

      // Refresh data after all folders are uploaded successfully
      try {
        await refreshCurrentData();
      } catch {
        // Don't fail the upload if refresh fails
      }

      onUploadComplete?.(true);
    },
    [
      currentPath,
      onUploadStart,
      onUploadComplete,
      addUploadItem,
      updateItemStatus,
      showDuplicateDialog,
      hideDuplicateDialog,
      refreshCurrentData,
    ]
  );

  // Helper function to process folder upload
  const processFolderUpload = useCallback(
    async (files: File[], itemId: string, folderName: string) => {
      updateItemStatus(itemId, 'uploading');

      let uploadedCount = 0;
      const totalFiles = files.length;

      for (const file of files) {
        try {
          const relativePath = file.webkitRelativePath;
          // Replace the original folder name with the (potentially renamed) folder name
          const pathParts = relativePath.split('/');
          pathParts[0] = folderName;
          const newRelativePath = pathParts.join('/');

          const s3Key = generateS3Key(newRelativePath, currentPath);
          const selectedMethod = determineUploadMethod(file.size, uploadMethod);

          if (selectedMethod === 'multipart-concurrent') {
            await apiS3.uploadMultipartParallely({
              file,
              key: s3Key,
              partSizeMB: 5,
              concurrency: 3,
            });
          } else {
            await apiS3.uploadMultipart({
              file,
              key: s3Key,
            });
          }

          uploadedCount++;
          const progress = Math.round((uploadedCount / totalFiles) * 100);

          updateProgress({
            itemId,
            progress,
            uploadedFiles: uploadedCount,
            totalFiles,
          });
        } catch {
          // Continue with other files even if one fails
        }
      }

      updateItemStatus(itemId, 'completed');
    },
    [currentPath, uploadMethod, updateItemStatus, updateProgress]
  );

  return {
    handleFileUpload,
    handleFolderUpload,
  };
}
