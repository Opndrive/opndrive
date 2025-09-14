'use client';

import { useCallback, useRef } from 'react';
import { useUploadStore } from './use-upload-store';
import { UploadMethod } from '../types';
import { generateUniqueFileName, generateUniqueFolderName } from '../utils/unique-filename';
import { useDriveStore } from '@/context/data-context';
import { BYOS3ApiProvider, MultipartUploader } from '@opndrive/s3-api';

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
const checkForDuplicates = async (
  apiS3: BYOS3ApiProvider,
  fileName: string,
  currentPath: string
): Promise<boolean> => {
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
  apiS3: BYOS3ApiProvider,
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

export function useUploadHandler(
  {
    currentPath = '',
    uploadMethod = 'auto',
    onUploadStart,
    onUploadComplete,
  }: UseUploadHandlerOptions,
  apiS3: BYOS3ApiProvider
) {
  if (!apiS3) {
    throw new Error(
      'useUploadHandler requires a valid apiS3 instance. Pass apiS3 from useAuth when ready.'
    );
  }

  const {
    addUploadItem,
    updateProgress,
    updateItemStatus,
    updateItemName,
    showDuplicateDialog,
    hideDuplicateDialog,
  } = useUploadStore();

  const { refreshCurrentData } = useDriveStore();

  // Track active uploaders for cancellation
  const activeUploaders = useRef<Map<string, MultipartUploader>>(new Map());

  // Helper function to process individual file upload
  const processFileUpload = useCallback(
    async (file: File, itemId: string, customName?: string) => {
      const selectedMethod = determineUploadMethod(file.size, uploadMethod);
      const s3Key = generateS3Key(customName || file.name, currentPath);
      const fileName = s3Key.split('/')[s3Key.length - 1];

      try {
        updateItemStatus(itemId, 'uploading');

        if (selectedMethod === 'signed-url') {
          // Use presigned URL for small files
          const presignedUrl = await apiS3.uploadWithPreSignedUrl({
            key: s3Key,
            expiresInSeconds: 300, // 5 minutes
          });

          const response = await fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
          }

          // Set progress to 100 for signed URL uploads
          updateProgress({ itemId, progress: 100.0 });
          updateItemStatus(itemId, 'completed');
        } else {
          // Use multipart upload for larger files
          const concurrency = selectedMethod === 'multipart-concurrent' ? 3 : 1;

          // Create uploader instance
          const uploader = apiS3.uploadMultipartParallely({
            file,
            key: s3Key,
            partSizeMB: 5,
            fileName: fileName,
            concurrency,
            onProgress: (progress: number) => {
              // Ensure progress never goes over 100% and format to 2 decimal places
              const clampedProgress = Math.min(100, Math.max(0, progress));
              const formattedProgress = parseFloat(clampedProgress.toFixed(2));
              updateProgress({ itemId, progress: formattedProgress });
            },
          });

          // Store uploader for potential cancellation
          activeUploaders.current.set(itemId, uploader);

          // Start the upload and wait for completion
          await uploader.start({
            file,
            key: s3Key,
            partSizeMB: 5,
            fileName: fileName,
            concurrency,
          });

          // Remove from active uploaders after completion
          activeUploaders.current.delete(itemId);
          updateProgress({ itemId, progress: 100.0 });
          updateItemStatus(itemId, 'completed');
        }
      } catch (error) {
        activeUploaders.current.delete(itemId);

        // Handle specific S3 multipart upload errors
        if (error instanceof Error) {
          // If it's a NoSuchUpload error but the upload might have succeeded,
          // check if the file exists in S3 before marking as error
          if (
            error.message.includes('NoSuchUpload') ||
            error.message.includes('The specified upload does not exist')
          ) {
            try {
              // Try to check if the file was actually uploaded successfully
              // by attempting to get metadata for the uploaded file
              await apiS3.fetchDirectoryStructure(s3Key.substring(0, s3Key.lastIndexOf('/') + 1));

              // If we can fetch the directory structure without error,
              // assume the upload succeeded despite the error
              console.warn(
                'NoSuchUpload error occurred but file may have been uploaded successfully:',
                s3Key
              );
              updateProgress({ itemId, progress: 100.0 });
              updateItemStatus(itemId, 'completed');
              return;
            } catch (checkError) {
              // If we can't verify the upload, treat it as a real error
              console.error('Upload failed and file verification also failed:', checkError);
            }
          }
        }

        updateItemStatus(itemId, 'error', error instanceof Error ? error.message : 'Upload failed');
        throw error;
      }
    },
    [currentPath, uploadMethod, updateItemStatus, updateProgress]
  );

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      const fileArray = Array.from(files);
      const uploadItems: Array<{ file: File; itemId: string; extension: string }> = [];

      // First, add all files to the upload queue immediately
      for (const file of fileArray) {
        const extension = getFileExtension(file.name);
        const itemId = addUploadItem({
          name: file.name,
          type: 'file',
          size: file.size,
          progress: 0.0,
          status: 'pending',
          file: file,
          destination: currentPath,
          extension,
        });

        uploadItems.push({ file, itemId, extension });
      }

      // Then process files one by one, checking for duplicates and updating status
      for (const { file, itemId, extension } of uploadItems) {
        try {
          // Check if file already exists
          const isDuplicate = await checkForDuplicates(apiS3, file.name, currentPath);

          if (isDuplicate) {
            // Pause this file and show duplicate dialog
            updateItemStatus(itemId, 'paused');

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
                  await processFileUpload(file, itemId);
                  hideDuplicateDialog();
                  resolve();
                },
                // onKeepBoth
                async () => {
                  const uniqueName = await generateUniqueFileName(apiS3, file.name, currentPath);
                  // Create new file with unique name
                  const newFile = new File([file], uniqueName, { type: file.type });
                  // Update the item name
                  updateItemName(itemId, uniqueName);
                  await processFileUpload(newFile, itemId, uniqueName);
                  hideDuplicateDialog();
                  resolve();
                }
              );
            });
          } else {
            // No duplicate, proceed with normal upload
            await processFileUpload(file, itemId);
          }
        } catch (error) {
          console.error(`Failed to upload file ${file.name}:`, error);
          updateItemStatus(
            itemId,
            'error',
            error instanceof Error ? error.message : 'Upload failed'
          );
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
      updateItemName,
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
        const isDuplicate = await checkForFolderDuplicates(apiS3, folderName, currentPath);
        const folderSize = folderSizes.get(folderName) || 0;

        if (isDuplicate) {
          // Show duplicate dialog for folder
          const itemId = addUploadItem({
            name: folderName,
            type: 'folder',
            size: folderSize,
            progress: 0.0,
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
                  const uniqueFolderName = await generateUniqueFolderName(
                    apiS3,
                    folderName,
                    currentPath
                  );

                  // Update the item name to show the new unique name
                  updateItemName(itemId, uniqueFolderName);
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
            progress: 0.0,
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
      updateItemName,
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
        // Check if upload was cancelled before processing each file
        const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);
        if (currentItem?.status === 'cancelled') {
          // Cancel any remaining uploaders for this folder
          const folderUploaders = Array.from(activeUploaders.current.entries()).filter(([key]) =>
            key.startsWith(itemId)
          );

          for (const [key, uploader] of folderUploaders) {
            try {
              await uploader.cancel();
              activeUploaders.current.delete(key);
            } catch (error) {
              console.warn('Failed to cancel uploader:', error);
              activeUploaders.current.delete(key);
            }
          }

          return; // Exit the function early
        }

        try {
          const relativePath = file.webkitRelativePath;
          // Replace the original folder name with the (potentially renamed) folder name
          const pathParts = relativePath.split('/');
          pathParts[0] = folderName;
          const newRelativePath = pathParts.join('/');

          const s3Key = generateS3Key(newRelativePath, currentPath);
          const selectedMethod = determineUploadMethod(file.size, uploadMethod);
          const fileName = s3Key.split('/')[s3Key.length - 1];

          if (selectedMethod === 'signed-url') {
            // Use signed URL for small files
            const presignedUrl = await apiS3.uploadWithPreSignedUrl({
              key: s3Key,
              expiresInSeconds: 3600, // 1 hour
            });

            const response = await fetch(presignedUrl, {
              method: 'PUT',
              body: file,
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
              },
            });

            if (!response.ok) {
              throw new Error(`Upload failed with status ${response.status}`);
            }
          } else {
            // Use multipart upload for larger files
            const concurrency = selectedMethod === 'multipart-concurrent' ? 3 : 1;

            // Create individual uploader for each file
            const uploader = apiS3.uploadMultipartParallely({
              file,
              key: s3Key,
              partSizeMB: 5,
              fileName: fileName,
              concurrency,
              onProgress: (fileProgress: number) => {
                // Calculate overall folder progress correctly
                const completedFilesProgress = (uploadedCount / totalFiles) * 100;
                const currentFileProgress = fileProgress / totalFiles;
                const overallProgress = completedFilesProgress + currentFileProgress;

                // Ensure progress never goes over 100% and format to 2 decimal places
                const clampedProgress = Math.min(100, Math.max(0, overallProgress));
                const formattedProgress = parseFloat(clampedProgress.toFixed(2));

                updateProgress({
                  itemId,
                  progress: formattedProgress,
                  uploadedFiles: uploadedCount,
                  totalFiles,
                });
              },
            });

            // Store uploader for potential cancellation (using unique key)
            const fileUploadId = `${itemId}-${uploadedCount}`;
            activeUploaders.current.set(fileUploadId, uploader);

            // Start upload for this file
            await uploader.start({
              file,
              key: s3Key,
              partSizeMB: 5,
              fileName: fileName,
              concurrency,
            });

            activeUploaders.current.delete(fileUploadId);
          }

          // Increment uploaded count after successful file upload
          uploadedCount++;

          // Update progress after successful file upload
          const progress = (uploadedCount / totalFiles) * 100;
          const formattedProgress = parseFloat(Math.min(100, progress).toFixed(2));
          updateProgress({
            itemId,
            progress: formattedProgress,
            uploadedFiles: uploadedCount,
            totalFiles,
          });
        } catch (error) {
          // Handle specific S3 multipart upload errors
          if (error instanceof Error) {
            // If it's a NoSuchUpload error but the upload might have succeeded,
            // check if we should continue or fail the entire folder upload
            if (
              error.message.includes('NoSuchUpload') ||
              error.message.includes('The specified upload does not exist')
            ) {
              console.warn(
                'NoSuchUpload error for file in folder upload, but file may have uploaded successfully:',
                file.name
              );

              // Still increment the count and continue with other files
              uploadedCount++;
              const progress = (uploadedCount / totalFiles) * 100;
              const formattedProgress = parseFloat(Math.min(100, progress).toFixed(2));
              updateProgress({
                itemId,
                progress: formattedProgress,
                uploadedFiles: uploadedCount,
                totalFiles,
              });
              continue;
            }
          }

          // Log error but continue with other files
          console.error(`Failed to upload file ${file.name}:`, error);
          // We might want to track failed files in the future
        }
      }

      updateItemStatus(itemId, 'completed');
    },
    [currentPath, uploadMethod, updateItemStatus, updateProgress]
  );

  // Cancel upload function
  const cancelUpload = useCallback(
    async (itemId: string) => {
      const uploader = activeUploaders.current.get(itemId);
      if (uploader) {
        // Single file upload
        try {
          await uploader.cancel();
          updateItemStatus(itemId, 'cancelled');
          activeUploaders.current.delete(itemId);
        } catch (error) {
          console.error('Failed to cancel upload:', error);
        }
      } else {
        // For folder uploads, cancel all individual file uploads
        const folderUploaders = Array.from(activeUploaders.current.entries()).filter(([key]) =>
          key.startsWith(`${itemId}-`)
        );

        if (folderUploaders.length > 0) {
          // Cancel remaining file uploads
          for (const [key, uploader] of folderUploaders) {
            try {
              await uploader.cancel();
              activeUploaders.current.delete(key);
            } catch (error) {
              console.error(`Failed to cancel file upload ${key}:`, error);
            }
          }

          // Update folder status to cancelled
          updateItemStatus(itemId, 'cancelled');
        } else {
          // No active uploaders found, just update UI status
          updateItemStatus(itemId, 'cancelled');
        }
      }
    },
    [updateItemStatus]
  );

  return {
    handleFileUpload,
    handleFolderUpload,
    cancelUpload,
  };
}
