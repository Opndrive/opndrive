'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useUploadStore } from './use-upload-store';
import { UploadItem, UploadMethod } from '../types';
import { generateUniqueFileName, generateUniqueFolderName } from '../utils/unique-filename';
import { generateS3Key } from '../utils/generate-s3-key';
import { useDriveStore } from '@/context/data-context';
import { BYOS3ApiProvider, MultipartUploader } from '@opndrive/s3-api';
import { uploadFileCache } from '../services/upload-file-cache';
import { persistentUploaderStorage } from '../services/persistent-uploader-storage';
import { uploadQueueManager } from '../services/upload-queue-manager';
import { FolderStructureProcessor } from '../utils/folder-structure-processor';
import { FolderStructure } from '../types/folder-upload-types';

// Helper function to get file extension
const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : '';
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

  // Clean up stale entries on hook initialization (once per session)
  useEffect(() => {
    const hasCleanedUp = sessionStorage.getItem('opndrive_storage_cleaned');
    if (!hasCleanedUp) {
      persistentUploaderStorage.cleanupStaleLocalStorage();
      sessionStorage.setItem('opndrive_storage_cleaned', 'true');
    }

    // Setup cleanup utilities for debugging (development only)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      import('../utils/cleanup-utils').then(({ setupCleanupUtils }) => {
        setupCleanupUtils();
      });
    }

    // Handle queued upload events
    const handleQueuedUpload = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { itemId, file, fileName } = customEvent.detail;

      // Store this event handler for later use after functions are defined
      window.__pendingQueuedUpload = { itemId, file, fileName };
    };

    window.addEventListener('startQueuedUpload', handleQueuedUpload);

    return () => {
      window.removeEventListener('startQueuedUpload', handleQueuedUpload);
    };
  }, []);

  // Helper function to determine if we should refresh data after upload completion
  const shouldRefreshAfterUpload = () => {
    const state = useUploadStore.getState();
    const activeUploads = state.items.filter(
      (item) => item.status === 'uploading' || item.status === 'pending'
    );

    // Only refresh if no other uploads are active or pending
    const shouldRefresh = activeUploads.length === 0;
    return shouldRefresh;
  };

  // Helper function to clean up S3 localStorage entries for an item
  const cleanupS3LocalStorageForItem = (itemId: string) => {
    try {
      // Get cached files to find the actual file names
      const cachedFiles = uploadFileCache.get(itemId);
      const cachedFile = uploadFileCache.getSingle(itemId);

      if (cachedFile) {
        // Clean up single file S3 state
        const s3Key = generateS3Key(cachedFile.name, currentPath);
        const splits = s3Key.split('/');
        const fileName = splits[splits.length - 1];
        const storageKey = `upload:${fileName}:${s3Key}`;
        localStorage.removeItem(storageKey);
      }

      if (cachedFiles && cachedFiles.length > 1) {
        // Clean up folder files S3 state
        cachedFiles.forEach((file) => {
          const s3Key = generateS3Key(file.name, currentPath);
          const splits = s3Key.split('/');
          const fileName = splits[splits.length - 1];
          const storageKey = `upload:${fileName}:${s3Key}`;
          localStorage.removeItem(storageKey);
        });
      }

      // Also clean up any entries that contain the current path or are upload-related
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.includes(itemId) ||
            (key.startsWith('upload:') && cachedFile && key.includes(cachedFile.name)) ||
            (key.startsWith('upload:') && key.includes(currentPath)))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error(`Error cleaning up localStorage for ${itemId}:`, error);
    }
  };

  const getUploadItem = (itemId: string): UploadItem | undefined => {
    return useUploadStore.getState().items.find((item) => item.id === itemId);
  };

  const getUploadFiles = (itemId: string): File[] | null => {
    return uploadFileCache.get(itemId);
  };

  const getUploadFile = (itemId: string): File | null => {
    return uploadFileCache.getSingle(itemId);
  };

  // Helper function to process individual file upload
  const processFileUpload = useCallback(
    async (file: File, itemId: string, customName?: string, targetPath?: string) => {
      const selectedMethod = determineUploadMethod(file.size, uploadMethod);
      const uploadTargetPath = targetPath || currentPath;
      const s3Key = generateS3Key(customName || file.name, uploadTargetPath);
      const splits = s3Key.split('/');
      const fileName = splits[splits.length - 1];

      try {
        updateItemStatus(itemId, 'uploading');

        if (selectedMethod === 'signed-url') {
          // Use presigned URL for small files
          // NOTE: Presigned URL uploads cannot be paused/resumed due to their atomic nature
          const presignedUrl = await apiS3.uploadWithPreSignedUrl({
            key: s3Key,
            expiresInSeconds: 300, // 5 minutes
          });

          // Retry logic for S3 rate limiting
          let retryCount = 0;
          const maxRetries = 3;
          let response: Response;

          while (retryCount <= maxRetries) {
            response = await fetch(presignedUrl, {
              method: 'PUT',
              body: file,
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
              },
            });

            if (response.ok) {
              break; // Success, exit retry loop
            }

            // Handle retryable errors
            if (response.status === 503 && response.statusText.includes('Slow Down')) {
              if (retryCount < maxRetries) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
                console.log(
                  `S3 rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                retryCount++;
                continue;
              } else {
                throw new Error(
                  `Upload failed: S3 rate limit exceeded after ${maxRetries + 1} attempts. Please try again later.`
                );
              }
            }

            // Non-retryable error
            throw new Error(`Upload failed: ${response.statusText} (${response.status})`);
          }

          // For presigned URL uploads, complete immediately as they cannot be paused
          updateProgress({ itemId, progress: 100.0 });
          updateItemStatus(itemId, 'completed');

          // Clean up cache since upload is complete
          uploadFileCache.remove(itemId);

          // Data refresh
          const shouldRefresh = shouldRefreshAfterUpload();
          if (shouldRefresh) {
            try {
              await refreshCurrentData();
            } catch {
              // Don't fail the upload if refresh fails
            }
          }
        } else {
          // Use multipart upload for larger files
          const concurrency = selectedMethod === 'multipart-concurrent' ? 3 : 1;

          const onProgress = (progress: number) => {
            // Check if upload was paused/cancelled before updating progress
            const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);
            if (currentItem?.status === 'paused' || currentItem?.status === 'cancelled') {
              return; // Don't update progress if paused/cancelled
            }

            // Ensure progress never goes over 100% and format to 2 decimal places
            const clampedProgress = Math.min(100, Math.max(0, progress));
            const formattedProgress = parseFloat(clampedProgress.toFixed(2));
            updateProgress({ itemId, progress: formattedProgress });
          };

          // Create uploader instance
          const uploader = apiS3.uploadMultipartParallely({
            key: s3Key,
            fileName: fileName,
            concurrency: concurrency,
            partSizeMB: 5,
          });

          // Store uploader for potential cancellation using persistent storage
          activeUploaders.current.set(itemId, uploader);
          persistentUploaderStorage.store(itemId, uploader, 'uploading', 0);
          uploadQueueManager.setUploaderInstance(itemId, uploader);

          try {
            // Start the upload and wait for completion
            await uploader.start(file, onProgress);

            // Upload completed successfully - check final status
            const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);

            // Important: Check if user paused during upload completion
            if (currentItem?.status === 'paused') {
              // CRITICAL: DO NOT DELETE UPLOADER HERE - keep for resume
              return; // Keep uploader and don't mark as completed
            } else if (currentItem?.status === 'cancelled') {
              // Clean up cancelled upload
              activeUploaders.current.delete(itemId);
              uploadFileCache.remove(itemId);
              return;
            } else {
              // Upload truly completed - clean up and mark as done
              activeUploaders.current.delete(itemId);
              uploadFileCache.remove(itemId);
              persistentUploaderStorage.remove(itemId);
              // Note: S3 localStorage cleanup is handled by the uploader itself on completion
              updateProgress({ itemId, progress: 100.0 });
              updateItemStatus(itemId, 'completed');
            }
          } catch (uploadError) {
            // Handle upload-specific errors (pause/cancel will not throw errors here)
            const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);

            // If the upload was paused or cancelled, don't treat it as an error
            if (currentItem?.status === 'paused' || currentItem?.status === 'cancelled') {
              return; // Keep uploader for potential resume
            }

            // For actual errors, clean up and re-throw
            console.error(`Upload error for ${itemId}:`, uploadError);
            activeUploaders.current.delete(itemId);
            uploadFileCache.remove(itemId);
            throw uploadError;
          }
        }
      } catch (error) {
        // Check if this is due to pause/cancel before cleaning up uploader
        const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);

        if (currentItem?.status === 'paused' || currentItem?.status === 'cancelled') {
          // Don't delete uploader - keep it for potential resume
          return; // Exit without cleanup
        }

        // Only clean up uploader on actual errors (not pauses)
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
              console.error(
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

  // Handle queued uploads after all functions are defined
  useEffect(() => {
    const handleQueuedUpload = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { itemId, file, fileName, targetPath } = customEvent.detail;

      try {
        // Check if this is a resume operation (existing uploader)
        const existingUploader =
          activeUploaders.current.get(itemId) || persistentUploaderStorage.get(itemId);

        if (existingUploader) {
          // This is a resume - use existing uploader
          updateItemStatus(itemId, 'uploading');

          // Update active status
          uploadQueueManager.setUploaderInstance(itemId, existingUploader);

          try {
            await existingUploader.resume(file, (progress: number) => {
              const currentItem = useUploadStore
                .getState()
                .items.find((item) => item.id === itemId);
              if (currentItem?.status === 'paused' || currentItem?.status === 'cancelled') {
                return;
              }

              const formattedProgress = parseFloat(Math.min(100, progress).toFixed(2));
              updateProgress({ itemId, progress: formattedProgress });
            });

            // Check final status after resume
            const finalItem = useUploadStore.getState().items.find((item) => item.id === itemId);
            if (finalItem?.status === 'paused' || finalItem?.status === 'cancelled') {
              // Upload was paused/cancelled during resume
              return;
            }

            // Resume completed successfully
            updateProgress({ itemId, progress: 100.0 });
            updateItemStatus(itemId, 'completed');
          } catch (resumeError) {
            console.error(`Resume error for ${itemId}:`, resumeError);
            throw resumeError;
          }
        } else {
          // This is a new upload - use normal process
          updateItemStatus(itemId, 'uploading');
          await processFileUpload(file, itemId, fileName, targetPath);
        }

        // Mark upload as completed and remove from queue
        uploadQueueManager.removeFromQueue(itemId);
        uploadQueueManager.setUploaderInstance(itemId, null);

        // Check if we should refresh data after upload completion
        // Don't let refresh errors affect the upload success status
        const shouldRefresh = shouldRefreshAfterUpload();
        if (shouldRefresh) {
          try {
            await refreshCurrentData();
          } catch (refreshError) {
            // Log refresh error but don't fail the upload
            console.warn('Data refresh failed after successful upload:', refreshError);
          }
        }
      } catch (error) {
        console.error(`Queued upload failed for ${itemId}:`, error);
        updateItemStatus(itemId, 'error', error instanceof Error ? error.message : 'Upload failed');
        uploadQueueManager.removeFromQueue(itemId);
      }
    };

    window.addEventListener('startQueuedUpload', handleQueuedUpload);

    return () => {
      window.removeEventListener('startQueuedUpload', handleQueuedUpload);
    };
  }, [processFileUpload, updateItemStatus, shouldRefreshAfterUpload, refreshCurrentData]);

  const handleFileUpload = useCallback(
    async (files: FileList | File[], overridePath?: string) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      // Use override path if provided, otherwise use current path
      const uploadPath = overridePath || currentPath;

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
          destination: currentPath,
          extension,
          operation: 'upload',
        });

        // Store file in cache
        uploadFileCache.store(itemId, file, 'file');

        uploadItems.push({ file, itemId, extension });
      }

      // Process files for duplicates and add to queue
      for (const { file, itemId, extension } of uploadItems) {
        try {
          // Check if file already exists
          const isDuplicate = await checkForDuplicates(apiS3, file.name, uploadPath);

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
                  destination: uploadPath,
                  extension,
                  operation: 'upload',
                },
                // onReplace
                async () => {
                  uploadQueueManager.addToQueue({ itemId, file, targetPath: uploadPath });
                  hideDuplicateDialog();
                  resolve();
                },
                // onKeepBoth
                async () => {
                  const uniqueName = await generateUniqueFileName(apiS3, file.name, uploadPath);
                  // Create new file with unique name
                  const newFile = new File([file], uniqueName, { type: file.type });
                  // Update the item name
                  updateItemName(itemId, uniqueName);
                  uploadQueueManager.addToQueue({
                    itemId,
                    file: newFile,
                    fileName: uniqueName,
                    targetPath: uploadPath,
                  });
                  hideDuplicateDialog();
                  resolve();
                }
              );
            });
          } else {
            // No duplicate, add to upload queue
            uploadQueueManager.addToQueue({ itemId, file, targetPath: uploadPath });
          }
        } catch (error) {
          console.error(`Failed to process file ${file.name}:`, error);
          updateItemStatus(
            itemId,
            'error',
            error instanceof Error ? error.message : 'Upload failed'
          );
        }
      }

      // Only refresh data if this was the last active upload completing
      const shouldRefresh = shouldRefreshAfterUpload();
      if (shouldRefresh) {
        try {
          await refreshCurrentData();
        } catch {
          // Don't fail the upload if refresh fails
        }
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
    async (files: FileList | File[], overridePath?: string) => {
      if (!files || files.length === 0) return;

      onUploadStart?.();

      const uploadPath = overridePath || currentPath;
      const processedData = FolderStructureProcessor.processFileList(files);

      if (processedData.folderStructures.length === 0) {
        onUploadComplete?.(false);
        return;
      }

      const folderUploadPromises = processedData.folderStructures.map(async (folderStructure) => {
        return processSingleFolder(folderStructure, uploadPath);
      });

      try {
        await Promise.all(folderUploadPromises);

        const shouldRefresh = shouldRefreshAfterUpload();
        if (shouldRefresh) {
          try {
            await refreshCurrentData();
          } catch {
            // Don't fail the upload if refresh fails
          }
        }

        onUploadComplete?.(true);
      } catch (error) {
        console.error('Folder upload failed:', error);
        onUploadComplete?.(false);
      }
    },
    [currentPath, onUploadStart, onUploadComplete, refreshCurrentData]
  );

  const processSingleFolder = useCallback(
    async (folderStructure: FolderStructure, uploadPath: string) => {
      const { name: folderName, files: folderFiles, totalSize: folderSize } = folderStructure;

      const isDuplicate = await checkForFolderDuplicates(apiS3, folderName, uploadPath);

      if (isDuplicate) {
        const itemId = addUploadItem({
          name: folderName,
          type: 'folder',
          size: folderSize,
          progress: 0.0,
          status: 'paused',
          destination: uploadPath,
          totalFiles: folderFiles.length,
          uploadedFiles: 0,
          operation: 'upload',
        });

        uploadFileCache.store(itemId, folderFiles, 'folder');

        return new Promise<void>((resolve) => {
          showDuplicateDialog(
            {
              id: itemId,
              name: folderName,
              type: 'folder',
              size: folderSize,
              progress: 0,
              status: 'paused',
              destination: uploadPath,
              totalFiles: folderFiles.length,
              uploadedFiles: 0,
              operation: 'upload',
            },
            async () => {
              try {
                await processFolderUpload(folderFiles, itemId, folderName, uploadPath);
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
            async () => {
              try {
                const uniqueFolderName = await generateUniqueFolderName(
                  apiS3,
                  folderName,
                  uploadPath
                );

                updateItemName(itemId, uniqueFolderName);
                await processFolderUpload(folderFiles, itemId, uniqueFolderName, uploadPath);
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
        const itemId = addUploadItem({
          name: folderName,
          type: 'folder',
          size: folderSize,
          progress: 0.0,
          status: 'pending',
          destination: uploadPath,
          totalFiles: folderFiles.length,
          uploadedFiles: 0,
          operation: 'upload',
        });

        uploadFileCache.store(itemId, folderFiles, 'folder');
        await processFolderUpload(folderFiles, itemId, folderName, uploadPath);
      }
    },
    [addUploadItem, updateItemStatus, updateItemName, showDuplicateDialog, hideDuplicateDialog]
  );

  // Helper function to process folder upload
  const processFolderUpload = useCallback(
    async (files: File[], itemId: string, folderName: string, targetPath?: string) => {
      const folderUploadPath = targetPath || currentPath;
      updateItemStatus(itemId, 'uploading');

      let uploadedCount = 0;
      const totalFiles = files.length;

      for (const file of files) {
        // Check if upload was cancelled or paused before processing each file
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
              console.error('Failed to cancel uploader:', error);
              activeUploaders.current.delete(key);
            }
          }

          return; // Exit the function early
        }

        if (currentItem?.status === 'paused') {
          // For paused uploads, just return without changing status - keep current progress
          return;
        }

        try {
          const relativePath = file.webkitRelativePath;
          // Replace the original folder name with the (potentially renamed) folder name
          const pathParts = relativePath.split('/');
          pathParts[0] = folderName;
          const newRelativePath = pathParts.join('/');

          const s3Key = generateS3Key(newRelativePath, folderUploadPath);
          const selectedMethod = determineUploadMethod(file.size, uploadMethod);
          const splits = s3Key.split('/');
          const fileName = splits[splits.length - 1];

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

            const onProgress = (progress: number) => {
              // Ensure progress never goes over 100% and format to 2 decimal places
              const clampedProgress = Math.min(100, Math.max(0, progress));
              const formattedProgress = parseFloat(clampedProgress.toFixed(2));
              updateProgress({ itemId, progress: formattedProgress });
            };

            // Create individual uploader for each file
            const uploader = apiS3.uploadMultipartParallely({
              key: s3Key,
              fileName: fileName,
              concurrency: concurrency,
              partSizeMB: 5,
            });

            // Store uploader for potential cancellation (using unique key)
            const fileUploadId = `${itemId}-${uploadedCount}`;
            activeUploaders.current.set(fileUploadId, uploader);

            // Start upload for this file
            await uploader.start(file, onProgress);

            // Check if upload was paused during the file upload
            const itemAfterUpload = useUploadStore
              .getState()
              .items.find((item) => item.id === itemId);
            if (itemAfterUpload?.status === 'paused') {
              // Keep the uploader for potential resume
              return;
            }

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
              console.error(
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

      // Only mark as completed if we actually finished all files
      const finalItem = useUploadStore.getState().items.find((item) => item.id === itemId);
      if (finalItem?.status !== 'paused' && finalItem?.status !== 'cancelled') {
        updateItemStatus(itemId, 'completed');
      }
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

          // Clean up file cache
          uploadFileCache.remove(itemId);

          // Clean up persistent storage
          persistentUploaderStorage.remove(itemId);

          // Remove from queue and process next item
          uploadQueueManager.removeFromQueue(itemId);

          // Clean up S3 multipart localStorage entries
          try {
            cleanupS3LocalStorageForItem(itemId);
          } catch (cleanupError) {
            console.error(`Error during S3 cleanup for ${itemId}:`, cleanupError);
          }
        } catch (error) {
          console.error('Failed to cancel upload:', error);
          // Still clean up our references even if S3 cancel failed
          activeUploaders.current.delete(itemId);
          uploadFileCache.remove(itemId);
          persistentUploaderStorage.remove(itemId);
          try {
            cleanupS3LocalStorageForItem(itemId);
          } catch (cleanupError) {
            console.error(`Error during fallback cleanup for ${itemId}:`, cleanupError);
          }
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
              // Clean up persistent storage for each file
              persistentUploaderStorage.remove(key);
            } catch (error) {
              console.error(`Failed to cancel file upload ${key}:`, error);
              // Still clean up references
              activeUploaders.current.delete(key);
              persistentUploaderStorage.remove(key);
            }
          }

          // Update folder status to cancelled
          updateItemStatus(itemId, 'cancelled');
        } else {
          // No active uploaders found - might be queued item
          updateItemStatus(itemId, 'cancelled');

          // Remove from queue if it's there
          if (
            uploadQueueManager.isUploadQueued(itemId) ||
            uploadQueueManager.isUploadActive(itemId)
          ) {
            uploadQueueManager.removeFromQueue(itemId);
          }
        }

        // Clean up file cache and persistent storage
        uploadFileCache.remove(itemId);
        persistentUploaderStorage.remove(itemId);

        // Clean up S3 localStorage entries
        cleanupS3LocalStorageForItem(itemId);
      }
    },
    [updateItemStatus]
  );

  const pauseUpload = useCallback(
    (itemId: string) => {
      const item = getUploadItem(itemId);

      // Don't pause if already completed, cancelled, or failed
      if (
        item?.status === 'completed' ||
        item?.status === 'cancelled' ||
        item?.status === 'error'
      ) {
        console.error(`Cannot pause upload ${itemId}: Upload is in ${item.status} state`);
        return;
      }

      // Check if upload is in queue first
      if (uploadQueueManager.isUploadQueued(itemId)) {
        // Remove from queue and mark as paused
        uploadQueueManager.removeFromQueue(itemId);
        updateItemStatus(itemId, 'paused');
        return;
      }

      const uploader = activeUploaders.current.get(itemId) || persistentUploaderStorage.get(itemId);

      if (uploader) {
        // Single file upload - pause immediately
        uploader.pause();
        updateItemStatus(itemId, 'paused');

        // Remove from active uploads to free up slot
        uploadQueueManager.pauseUpload(itemId);

        // Update persistent storage status
        const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);
        persistentUploaderStorage.updateStatus(itemId, 'paused', currentItem?.progress);
        // CRITICAL: DO NOT DELETE UPLOADER HERE - it must remain for resume
      } else if (item?.type === 'folder') {
        // Folder upload - first update status to paused
        updateItemStatus(itemId, 'paused');

        // Then pause all active file uploads within this folder
        const folderUploaders = Array.from(activeUploaders.current.entries()).filter(([key]) =>
          key.startsWith(`${itemId}-`)
        );

        if (folderUploaders.length > 0) {
          folderUploaders.forEach(([, uploader]) => {
            uploader.pause();
          });
        }

        // Note: The processFolderUpload function will check the status and stop processing new files
      } else {
        console.error(`Could not pause upload ${itemId}: Uploader not found.`);
      }
    },
    [updateItemStatus]
  );

  // Helper function to resume folder upload from where it left off
  const resumeFolderUpload = useCallback(
    async (
      files: File[],
      itemId: string,
      folderName: string,
      startFromIndex: number = 0,
      targetPath?: string
    ) => {
      const folderUploadPath = targetPath || currentPath;
      const totalFiles = files.length;
      let uploadedCount = startFromIndex;

      // Resume from the file index where we left off
      for (let i = startFromIndex; i < files.length; i++) {
        const file = files[i];

        // Check if upload was cancelled or paused
        const currentItem = useUploadStore.getState().items.find((item) => item.id === itemId);
        if (currentItem?.status === 'cancelled' || currentItem?.status === 'paused') {
          return;
        }

        try {
          const relativePath = file.webkitRelativePath;
          const pathParts = relativePath.split('/');
          pathParts[0] = folderName;
          const newRelativePath = pathParts.join('/');

          const s3Key = generateS3Key(newRelativePath, folderUploadPath);
          const selectedMethod = determineUploadMethod(file.size, uploadMethod);
          const splits = s3Key.split('/');
          const fileName = splits[splits.length - 1];

          if (selectedMethod === 'signed-url') {
            const presignedUrl = await apiS3.uploadWithPreSignedUrl({
              key: s3Key,
              expiresInSeconds: 3600,
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
            const concurrency = selectedMethod === 'multipart-concurrent' ? 3 : 1;
            const fileUploadId = `${itemId}-${i}`;

            const uploader = apiS3.uploadMultipartParallely({
              key: s3Key,
              fileName: fileName,
              concurrency: concurrency,
              partSizeMB: 5,
            });

            activeUploaders.current.set(fileUploadId, uploader);

            await uploader.start(file, (progress: number) => {
              const clampedProgress = Math.min(100, Math.max(0, progress));
              const formattedProgress = parseFloat(clampedProgress.toFixed(2));
              updateProgress({ itemId, progress: formattedProgress });
            });

            activeUploaders.current.delete(fileUploadId);
          }

          uploadedCount++;
          const progress = (uploadedCount / totalFiles) * 100;
          const formattedProgress = parseFloat(Math.min(100, progress).toFixed(2));
          updateProgress({
            itemId,
            progress: formattedProgress,
            uploadedFiles: uploadedCount,
            totalFiles,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message.includes('NoSuchUpload') ||
              error.message.includes('The specified upload does not exist'))
          ) {
            // File may have uploaded successfully despite error
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

          console.error(`Failed to upload file ${file.name}:`, error);
          // Continue with next file instead of failing entire folder
        }
      }

      // Only mark as completed if we actually finished all files
      const finalItem = useUploadStore.getState().items.find((item) => item.id === itemId);
      if (finalItem?.status !== 'paused' && finalItem?.status !== 'cancelled') {
        updateItemStatus(itemId, 'completed');
      }
    },
    [currentPath, uploadMethod, updateItemStatus, updateProgress]
  );

  const resumeUpload = useCallback(
    async (itemId: string) => {
      // Check if uploader exists - we'll remove and recreate if needed
      activeUploaders.current.get(itemId);
      const item = getUploadItem(itemId);

      if (!item) {
        console.error(`Could not resume upload ${itemId}: Item not found in store.`);
        return;
      }

      // Don't resume if already completed, cancelled, or failed
      if (item.status === 'completed' || item.status === 'cancelled' || item.status === 'error') {
        console.error(`Cannot resume upload ${itemId}: Upload is in ${item.status} state`);
        return;
      }

      // Only resume if currently paused
      if (item.status !== 'paused') {
        console.error(
          `Cannot resume upload ${itemId}: Upload is not paused (current status: ${item.status})`
        );
        return;
      }

      // Get files from cache instead of item
      const cachedFiles = getUploadFiles(itemId);
      const cachedFile = getUploadFile(itemId);

      // Always add resumed uploads to queue for proper sequential processing
      if (cachedFile && item.type === 'file') {
        // Add to queue with high priority (will be processed first)
        uploadQueueManager.resumeUpload(itemId, cachedFile);
        updateItemStatus(itemId, 'pending');
        return;
      } else if (cachedFiles && item.type === 'folder') {
        // Folder upload resume
        try {
          updateItemStatus(itemId, 'uploading');
          await resumeFolderUpload(
            cachedFiles,
            itemId,
            item.name,
            item.uploadedFiles || 0,
            item.destination
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Resume failed';
          console.error(`Resume folder error for ${itemId}:`, errorMessage);
          updateItemStatus(itemId, 'error', errorMessage);
        }
      } else {
        console.error(`Could not resume upload ${itemId}: Missing cached files.`, {
          itemType: item.type,
          hasCachedFiles: !!cachedFiles,
          cachedFilesCount: cachedFiles?.length || 0,
          hasCachedFile: !!cachedFile,
        });
        updateItemStatus(itemId, 'error', 'Upload files not found');
      }
    },
    [updateItemStatus, updateProgress, uploadMethod, currentPath]
  );

  return {
    handleFileUpload,
    handleFolderUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
  };
}
