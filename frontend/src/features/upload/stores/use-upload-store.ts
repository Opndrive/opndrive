'use client';

import { UploadStatus, BYOS3ApiProvider, UploadManager } from '@opndrive/s3-api';
import { create } from 'zustand';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { generateUniqueFileName, generateUniqueFolderName } from '../utils/unique-filename';
import { useDriveStore } from '@/context/data-context';

// Enhanced batch tracking types
interface UploadBatch {
  id: string;
  type: 'file' | 'folder' | 'mixed';
  uploadIds: string[];
  completedCount: number;
  totalCount: number;
  createdAt: number;
  lastActivity: number;
  isComplete: boolean;
  hasTriggeredRefresh: boolean; // Track if this batch already triggered a refresh
}

interface RefreshState {
  debounceTimer: NodeJS.Timeout | null;
  isRefreshing: boolean;
  lastRefreshAttempt: number;
}

// Global refresh state management
const refreshState: RefreshState = {
  debounceTimer: null,
  isRefreshing: false,
  lastRefreshAttempt: 0,
};

// Constants for timing
const MIN_REFRESH_INTERVAL_MS = 3000; // Prevent spam refreshing

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

// Helper function to check if file already exists
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
    const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1);

    // If we find any objects (files or folders) with this prefix, the folder exists
    return result.files.length > 0 || result.folders.length > 0;
  } catch {
    // If there's an error checking, assume it doesn't exist
    return false;
  }
};

interface DuplicateDialogState {
  isOpen: boolean;
  duplicateItem: {
    name: string;
    type: 'file' | 'folder';
    size?: number;
    files?: File[];
  } | null;
  onReplace: (() => void) | null;
  onKeepBoth: (() => void) | null;
}

interface UploadProgress {
  id: string;
  name: string;
  status: UploadStatus;
  progress: number;
  type: 'file' | 'folder';
  parentFolderId?: string; // For files that belong to a folder
  fileIds?: string[]; // For folders, track their file IDs
}

interface DeleteProgress {
  id: string;
  name: string;
  status: 'queued' | 'deleting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  type: 'file' | 'folder';
  size?: number;
  totalFiles?: number;
  completedFiles?: number;
  operationLabel?: string;
  extension?: string;
  isCalculatingSize?: boolean;
  abortController?: AbortController;
  error?: string;
}

interface UploadStore {
  uploadManager: UploadManager | null;
  uploads: Record<string, UploadProgress>;
  deletes: Record<string, DeleteProgress>;
  batches: Record<string, UploadBatch>;
  duplicateDialog: DuplicateDialogState;
  setUploadManager: (manager: UploadManager | null) => void;
  setUploads: (uploads: Record<string, UploadProgress>) => void;
  addUpload: (id: string, upload: UploadProgress) => void;
  updateUpload: (id: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  handleFilesDroppedToDirectory: (
    processedData: ProcessedDragData,
    currentPrefix: string | null,
    apiS3?: BYOS3ApiProvider,
    uploadManager?: UploadManager | null
  ) => Promise<void>;
  handleFilesDroppedToFolder: (
    processedData: ProcessedDragData,
    targetFolder: DragDropTarget,
    currentPrefix: string | null,
    apiS3?: BYOS3ApiProvider,
    uploadManager?: UploadManager | null
  ) => Promise<void>;

  // Delete operation methods
  addDeleteOperation: (id: string, operation: DeleteProgress) => void;
  updateDeleteProgress: (
    id: string,
    progress: number,
    completedFiles?: number,
    totalFiles?: number
  ) => void;
  setCalculatingSize: (id: string, isCalculating: boolean) => void;
  updateSize: (id: string, size: number, totalFiles?: number) => void;
  completeDeleteOperation: (id: string) => void;
  failDeleteOperation: (id: string, error: string) => void;
  cancelDeleteOperation: (id: string) => void;
  isDeleteOperationActive: (id: string) => boolean;
  getDeleteAbortController: (id: string) => AbortController | undefined;
  removeDeleteOperation: (id: string) => void;

  // Duplicate dialog methods
  showDuplicateDialog: (
    duplicateItem: { name: string; type: 'file' | 'folder'; size?: number; files?: File[] },
    onReplace: () => void,
    onKeepBoth: () => void
  ) => void;
  hideDuplicateDialog: () => void;

  // Batch tracking methods
  createUploadBatch: (type: UploadBatch['type'], uploadIds: string[]) => string;
  updateBatchProgress: (batchId: string, uploadId: string, isCompleted: boolean) => void;
  getBatch: (batchId: string) => UploadBatch | undefined;
  isBatchComplete: (batchId: string) => boolean;
  cleanupCompletedBatches: () => void;

  // Enhanced data refresh methods
  refreshDataAfterUploadBatch: () => Promise<void>;
  forceRefreshData: () => Promise<void>;
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploadManager: null,

  setUploadManager: (manager) => set({ uploadManager: manager }),

  uploads: {},
  deletes: {},
  batches: {},
  duplicateDialog: {
    isOpen: false,
    duplicateItem: null,
    onReplace: null,
    onKeepBoth: null,
  },

  setUploads: (uploads: Record<string, UploadProgress>) => set({ uploads }),

  addUpload: (id: string, upload: UploadProgress) =>
    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: upload,
      },
    })),

  updateUpload: (id: string, updates: Partial<UploadProgress>) => {
    console.log(`Updating upload ${id} with status: ${updates.status}`);

    set((state) => ({
      uploads: {
        ...state.uploads,
        [id]: {
          ...state.uploads[id],
          ...updates,
        },
      },
    }));

    // Simple refresh on successful upload completion
    if (updates.status === 'completed') {
      console.log(`Upload ${id} completed - triggering data refresh`);
      const { refreshDataAfterUploadBatch } = get();

      // Refresh immediately on each successful upload
      refreshDataAfterUploadBatch().catch((error) => {
        console.error('Upload refresh failed:', error);
      });
    }
  },

  removeUpload: (id: string) =>
    set((state) => ({
      uploads: Object.fromEntries(Object.entries(state.uploads).filter(([key]) => key !== id)),
    })),

  clearCompleted: () =>
    set((state) => ({
      uploads: Object.fromEntries(
        Object.entries(state.uploads).filter(
          ([_, upload]) => !['completed', 'cancelled', 'failed'].includes(upload.status)
        )
      ),
    })),

  clearAll: () => set({ uploads: {} }),

  handleFilesDroppedToDirectory: async (
    processedData: ProcessedDragData,
    currentPrefix: string | null,
    apiS3?: BYOS3ApiProvider | null
  ) => {
    const { uploadManager, addUpload, showDuplicateDialog } = get();

    if (!uploadManager) {
      return;
    }

    if (processedData.individualFiles.length > 0) {
      // Process individual files with duplicate checking
      for (const file of processedData.individualFiles) {
        // Check for duplicates if API is available
        if (apiS3) {
          const isDuplicate = await checkForDuplicates(apiS3, file.name, currentPrefix || '');

          if (isDuplicate) {
            // Show duplicate dialog
            return new Promise<void>((resolve) => {
              showDuplicateDialog(
                {
                  name: file.name,
                  type: 'file',
                  size: file.size,
                },
                // onReplace - overwrite the existing file
                async () => {
                  const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                  let key = '';

                  if (uploadManager['prefix'] && currPrefix) {
                    key = `${uploadManager['prefix']}${currPrefix}${file.name}`;
                  } else if (uploadManager['prefix'] && !currPrefix) {
                    key = `${uploadManager['prefix']}${file.name}`;
                  } else if (!uploadManager['prefix'] && currPrefix) {
                    key = `${currPrefix}${file.name}`;
                  } else {
                    key = file.name;
                  }

                  const id = uploadManager.addUpload(file, { key });
                  addUpload(id, {
                    id,
                    name: file.name,
                    status: 'queued',
                    progress: 0,
                    type: 'file',
                  });
                  resolve();
                },
                // onKeepBoth - generate unique name
                async () => {
                  try {
                    const uniqueName = await generateUniqueFileName(
                      apiS3,
                      file.name,
                      currentPrefix || ''
                    );

                    // Create new file with unique name
                    const renamedFile = new File([file], uniqueName, { type: file.type });

                    const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                    let key = '';

                    if (uploadManager['prefix'] && currPrefix) {
                      key = `${uploadManager['prefix']}${currPrefix}${uniqueName}`;
                    } else if (uploadManager['prefix'] && !currPrefix) {
                      key = `${uploadManager['prefix']}${uniqueName}`;
                    } else if (!uploadManager['prefix'] && currPrefix) {
                      key = `${currPrefix}${uniqueName}`;
                    } else {
                      key = uniqueName;
                    }

                    const id = uploadManager.addUpload(renamedFile, { key });
                    addUpload(id, {
                      id,
                      name: uniqueName,
                      status: 'queued',
                      progress: 0,
                      type: 'file',
                    });
                    resolve();
                  } catch (error) {
                    console.error('Failed to generate unique filename:', error);
                    resolve();
                  }
                }
              );
            });
          }
        }

        // No duplicate or no API - proceed normally
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}${file.name}`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}${file.name}`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}${file.name}`;
        } else {
          key = file.name;
        }

        const id = uploadManager.addUpload(file, { key });
        addUpload(id, { id, name: file.name, status: 'queued', progress: 0, type: 'file' });
      }
    }

    // 2. Upload Folders
    if (processedData.folderStructures.length > 0) {
      for (const folder of processedData.folderStructures) {
        // Check for folder duplicates if API is available
        if (apiS3) {
          const isDuplicate = await checkForFolderDuplicates(
            apiS3,
            folder.name,
            currentPrefix || ''
          );

          if (isDuplicate) {
            // Show duplicate dialog for folder
            return new Promise<void>((resolve) => {
              showDuplicateDialog(
                {
                  name: folder.name,
                  type: 'folder',
                  files: Array.from(folder.files),
                },
                // onReplace - overwrite the existing folder
                async () => {
                  const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                  let key = '';

                  if (uploadManager['prefix'] && currPrefix) {
                    key = `${uploadManager['prefix']}${currPrefix}`;
                  } else if (uploadManager['prefix'] && !currPrefix) {
                    key = `${uploadManager['prefix']}`;
                  } else if (!uploadManager['prefix'] && currPrefix) {
                    key = `${currPrefix}`;
                  }

                  const { folderId, fileIds } = uploadManager.addFolderUpload(
                    folder.files as unknown as FileList,
                    {
                      basePrefix: key,
                    }
                  );

                  // Add folder to our local state
                  addUpload(folderId, {
                    id: folderId,
                    name: folder.name,
                    status: 'queued',
                    progress: 0,
                    type: 'folder',
                    fileIds: fileIds,
                  });

                  // Add all files from the folder to our local state for UI feedback
                  fileIds.forEach((id: string, index: number) => {
                    const file = folder.files[index];
                    addUpload(id, {
                      id,
                      name: file.webkitRelativePath,
                      status: 'queued',
                      progress: 0,
                      type: 'file',
                      parentFolderId: folderId,
                    });
                  });
                  resolve();
                },
                // onKeepBoth - generate unique folder name
                async () => {
                  try {
                    const uniqueName = await generateUniqueFolderName(
                      apiS3,
                      folder.name,
                      currentPrefix || ''
                    );

                    const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                    let key = '';

                    if (uploadManager['prefix'] && currPrefix) {
                      key = `${uploadManager['prefix']}${currPrefix}`;
                    } else if (uploadManager['prefix'] && !currPrefix) {
                      key = `${uploadManager['prefix']}`;
                    } else if (!uploadManager['prefix'] && currPrefix) {
                      key = `${currPrefix}`;
                    }

                    const { folderId, fileIds } = uploadManager.addFolderUpload(
                      folder.files as unknown as FileList,
                      {
                        basePrefix: key,
                      }
                    );

                    // Add folder to our local state with unique name
                    addUpload(folderId, {
                      id: folderId,
                      name: uniqueName,
                      status: 'queued',
                      progress: 0,
                      type: 'folder',
                      fileIds: fileIds,
                    });

                    // Add all files from the folder to our local state for UI feedback
                    fileIds.forEach((id: string, index: number) => {
                      const file = folder.files[index];
                      addUpload(id, {
                        id,
                        name: file.webkitRelativePath.replace(folder.name, uniqueName),
                        status: 'queued',
                        progress: 0,
                        type: 'file',
                        parentFolderId: folderId,
                      });
                    });
                    resolve();
                  } catch (error) {
                    console.error('Failed to generate unique folder name:', error);
                    resolve();
                  }
                }
              );
            });
          }
        }

        // No duplicate or no API - proceed normally
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}`;
        }

        const { folderId, fileIds } = uploadManager.addFolderUpload(
          folder.files as unknown as FileList,
          {
            basePrefix: key,
          }
        );

        // Add folder to our local state
        addUpload(folderId, {
          id: folderId,
          name: folder.name,
          status: 'queued',
          progress: 0,
          type: 'folder',
          fileIds: fileIds,
        });

        // Add all files from the folder to our local state for UI feedback
        fileIds.forEach((id: string, index: number) => {
          const file = folder.files[index];
          addUpload(id, {
            id,
            name: file.webkitRelativePath,
            status: 'queued',
            progress: 0,
            type: 'file',
            parentFolderId: folderId,
          });
        });
      }
    }
  },

  handleFilesDroppedToFolder: async (
    processedData: ProcessedDragData,
    targetFolder: DragDropTarget,
    currentPrefix: string | null,
    apiS3?: BYOS3ApiProvider,
    uploadManager?: UploadManager | null
  ) => {
    const { addUpload, showDuplicateDialog } = get();

    if (!uploadManager) {
      console.error('UploadManager not available');
      return;
    }

    if (!uploadManager) {
      return;
    }

    if (processedData.individualFiles.length > 0) {
      // Process individual files with duplicate checking
      for (const file of processedData.individualFiles) {
        const targetPath =
          currentPrefix === '/'
            ? targetFolder.name
            : currentPrefix
              ? `${currentPrefix}${targetFolder.name}`
              : targetFolder.name;

        // Check for duplicates if API is available
        if (apiS3) {
          const isDuplicate = await checkForDuplicates(apiS3, file.name, targetPath);

          if (isDuplicate) {
            // Show duplicate dialog
            return new Promise<void>((resolve) => {
              showDuplicateDialog(
                {
                  name: file.name,
                  type: 'file',
                  size: file.size,
                },
                // onReplace - overwrite the existing file
                async () => {
                  const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                  let key = '';

                  if (uploadManager['prefix'] && currPrefix) {
                    key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/${file.name}`;
                  } else if (uploadManager['prefix'] && !currPrefix) {
                    key = `${uploadManager['prefix']}${targetFolder.name}/${file.name}`;
                  } else if (!uploadManager['prefix'] && currPrefix) {
                    key = `${currPrefix}${targetFolder.name}/${file.name}`;
                  } else {
                    key = `${targetFolder.name}/${file.name}`;
                  }

                  const id = uploadManager.addUpload(file, { key });
                  addUpload(id, {
                    id,
                    name: file.name,
                    status: 'queued',
                    progress: 0,
                    type: 'file',
                  });
                  resolve();
                },
                // onKeepBoth - generate unique name
                async () => {
                  try {
                    const uniqueName = await generateUniqueFileName(apiS3, file.name, targetPath);

                    // Create new file with unique name
                    const renamedFile = new File([file], uniqueName, { type: file.type });

                    const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                    let key = '';

                    if (uploadManager['prefix'] && currPrefix) {
                      key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/${uniqueName}`;
                    } else if (uploadManager['prefix'] && !currPrefix) {
                      key = `${uploadManager['prefix']}${targetFolder.name}/${uniqueName}`;
                    } else if (!uploadManager['prefix'] && currPrefix) {
                      key = `${currPrefix}${targetFolder.name}/${uniqueName}`;
                    } else {
                      key = `${targetFolder.name}/${uniqueName}`;
                    }

                    const id = uploadManager.addUpload(renamedFile, { key });
                    addUpload(id, {
                      id,
                      name: uniqueName,
                      status: 'queued',
                      progress: 0,
                      type: 'file',
                    });
                    resolve();
                  } catch (error) {
                    console.error('Failed to generate unique filename:', error);
                    resolve();
                  }
                }
              );
            });
          }
        }

        // No duplicate or no API - proceed normally
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/${file.name}`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}${targetFolder.name}/${file.name}`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}${targetFolder.name}/${file.name}`;
        } else {
          key = `${targetFolder.name}/${file.name}`;
        }

        const id = uploadManager.addUpload(file, { key });
        addUpload(id, { id, name: file.name, status: 'queued', progress: 0, type: 'file' });
      }
    }

    // 2. Upload Folders
    if (processedData.folderStructures.length > 0) {
      for (const folder of processedData.folderStructures) {
        const targetPath =
          currentPrefix === '/'
            ? targetFolder.name
            : currentPrefix
              ? `${currentPrefix}${targetFolder.name}`
              : targetFolder.name;

        // Check for folder duplicates if API is available
        if (apiS3) {
          const isDuplicate = await checkForFolderDuplicates(apiS3, folder.name, targetPath);

          if (isDuplicate) {
            // Show duplicate dialog for folder
            return new Promise<void>((resolve) => {
              showDuplicateDialog(
                {
                  name: folder.name,
                  type: 'folder',
                  files: Array.from(folder.files),
                },
                // onReplace - overwrite the existing folder
                async () => {
                  const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                  let key = '';

                  if (uploadManager['prefix'] && currPrefix) {
                    key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/`;
                  } else if (uploadManager['prefix'] && !currPrefix) {
                    key = `${uploadManager['prefix']}${targetFolder.name}/`;
                  } else if (!uploadManager['prefix'] && currPrefix) {
                    key = `${currPrefix}${targetFolder.name}/`;
                  } else {
                    key = `${targetFolder.name}/`;
                  }

                  const { folderId, fileIds } = uploadManager.addFolderUpload(
                    folder.files as unknown as FileList,
                    {
                      basePrefix: key,
                    }
                  );

                  // Add folder to our local state
                  addUpload(folderId, {
                    id: folderId,
                    name: folder.name,
                    status: 'queued',
                    progress: 0,
                    type: 'folder',
                    fileIds: fileIds,
                  });

                  // Add all files from the folder to our local state for UI feedback
                  fileIds.forEach((id: string, index: number) => {
                    const file = folder.files[index];
                    addUpload(id, {
                      id,
                      name: file.webkitRelativePath,
                      status: 'queued',
                      progress: 0,
                      type: 'file',
                      parentFolderId: folderId,
                    });
                  });
                  resolve();
                },
                // onKeepBoth - generate unique folder name
                async () => {
                  try {
                    const uniqueName = await generateUniqueFolderName(
                      apiS3,
                      folder.name,
                      targetPath
                    );

                    const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
                    let key = '';

                    if (uploadManager['prefix'] && currPrefix) {
                      key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/`;
                    } else if (uploadManager['prefix'] && !currPrefix) {
                      key = `${uploadManager['prefix']}${targetFolder.name}/`;
                    } else if (!uploadManager['prefix'] && currPrefix) {
                      key = `${currPrefix}${targetFolder.name}/`;
                    } else {
                      key = `${targetFolder.name}/`;
                    }

                    const { folderId, fileIds } = uploadManager.addFolderUpload(
                      folder.files as unknown as FileList,
                      {
                        basePrefix: key,
                      }
                    );

                    // Add folder to our local state with unique name
                    addUpload(folderId, {
                      id: folderId,
                      name: uniqueName,
                      status: 'queued',
                      progress: 0,
                      type: 'folder',
                      fileIds: fileIds,
                    });

                    // Add all files from the folder to our local state for UI feedback
                    fileIds.forEach((id: string, index: number) => {
                      const file = folder.files[index];
                      addUpload(id, {
                        id,
                        name: file.webkitRelativePath.replace(folder.name, uniqueName),
                        status: 'queued',
                        progress: 0,
                        type: 'file',
                        parentFolderId: folderId,
                      });
                    });
                    resolve();
                  } catch (error) {
                    console.error('Failed to generate unique folder name:', error);
                    resolve();
                  }
                }
              );
            });
          }
        }

        // No duplicate or no API - proceed normally
        const currPrefix = currentPrefix === '/' ? '' : currentPrefix;
        let key = '';

        if (uploadManager['prefix'] && currPrefix) {
          key = `${uploadManager['prefix']}${currPrefix}${targetFolder.name}/`;
        } else if (uploadManager['prefix'] && !currPrefix) {
          key = `${uploadManager['prefix']}${targetFolder.name}/`;
        } else if (!uploadManager['prefix'] && currPrefix) {
          key = `${currPrefix}${targetFolder.name}/`;
        } else {
          key = `${targetFolder.name}/`;
        }

        const { folderId, fileIds } = uploadManager.addFolderUpload(
          folder.files as unknown as FileList,
          {
            basePrefix: key,
          }
        );

        // Add folder to our local state
        addUpload(folderId, {
          id: folderId,
          name: folder.name,
          status: 'queued',
          progress: 0,
          type: 'folder',
          fileIds: fileIds,
        });

        // Add all files from the folder to our local state for UI feedback
        fileIds.forEach((id: string, index: number) => {
          const file = folder.files[index];
          addUpload(id, {
            id,
            name: file.webkitRelativePath,
            status: 'queued',
            progress: 0,
            type: 'file',
            parentFolderId: folderId,
          });
        });
      }
    }
  },

  // Delete operation methods
  addDeleteOperation: (id: string, operation: DeleteProgress) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: operation,
      },
    })),

  updateDeleteProgress: (
    id: string,
    progress: number,
    completedFiles?: number,
    totalFiles?: number
  ) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          progress,
          ...(completedFiles !== undefined && { completedFiles }),
          ...(totalFiles !== undefined && { totalFiles }),
        },
      },
    })),

  setCalculatingSize: (id: string, isCalculating: boolean) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          isCalculatingSize: isCalculating,
        },
      },
    })),

  updateSize: (id: string, size: number, totalFiles?: number) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          size,
          ...(totalFiles !== undefined && { totalFiles }),
        },
      },
    })),

  completeDeleteOperation: (id: string) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          status: 'completed',
          progress: 100,
        },
      },
    })),

  failDeleteOperation: (id: string, error: string) =>
    set((state) => ({
      deletes: {
        ...state.deletes,
        [id]: {
          ...state.deletes[id],
          status: 'failed',
          error,
        },
      },
    })),

  cancelDeleteOperation: (id: string) =>
    set((state) => {
      const deleteOp = state.deletes[id];
      if (deleteOp?.abortController) {
        deleteOp.abortController.abort();
      }
      return {
        deletes: {
          ...state.deletes,
          [id]: {
            ...deleteOp,
            status: 'cancelled',
          },
        },
      };
    }),

  isDeleteOperationActive: (id: string) => {
    const { deletes } = get();
    const deleteOp = deletes[id];
    return deleteOp && !['completed', 'failed', 'cancelled'].includes(deleteOp.status);
  },

  getDeleteAbortController: (id: string) => {
    const { deletes } = get();
    return deletes[id]?.abortController;
  },

  removeDeleteOperation: (id: string) =>
    set((state) => ({
      deletes: Object.fromEntries(Object.entries(state.deletes).filter(([key]) => key !== id)),
    })),

  // Duplicate dialog methods
  showDuplicateDialog: (duplicateItem, onReplace, onKeepBoth) =>
    set({
      duplicateDialog: {
        isOpen: true,
        duplicateItem,
        onReplace,
        onKeepBoth,
      },
    }),

  hideDuplicateDialog: () =>
    set({
      duplicateDialog: {
        isOpen: false,
        duplicateItem: null,
        onReplace: null,
        onKeepBoth: null,
      },
    }),

  // Batch tracking methods
  createUploadBatch: (type: UploadBatch['type'], uploadIds: string[]): string => {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const batch: UploadBatch = {
      id: batchId,
      type,
      uploadIds: [...uploadIds],
      completedCount: 0,
      totalCount: uploadIds.length,
      createdAt: now,
      lastActivity: now,
      isComplete: false,
      hasTriggeredRefresh: false,
    };

    set((state) => ({
      batches: {
        ...state.batches,
        [batchId]: batch,
      },
    }));

    return batchId;
  },

  updateBatchProgress: (batchId: string, uploadId: string, isCompleted: boolean) => {
    set((state) => {
      const batch = state.batches[batchId];
      if (!batch) return state;

      const _wasAlreadyCompleted = batch.isComplete;
      const newCompletedCount = isCompleted ? batch.completedCount + 1 : batch.completedCount;

      const isNowComplete = newCompletedCount >= batch.totalCount;

      return {
        batches: {
          ...state.batches,
          [batchId]: {
            ...batch,
            completedCount: newCompletedCount,
            lastActivity: Date.now(),
            isComplete: isNowComplete,
          },
        },
      };
    });
  },

  getBatch: (batchId: string): UploadBatch | undefined => {
    return get().batches[batchId];
  },

  isBatchComplete: (batchId: string): boolean => {
    const batch = get().batches[batchId];
    return batch?.isComplete ?? false;
  },

  cleanupCompletedBatches: () => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    set((state) => ({
      batches: Object.fromEntries(
        Object.entries(state.batches).filter(([, batch]) => {
          return !batch.isComplete || now - batch.lastActivity < maxAge;
        })
      ),
    }));
  },

  // Simple immediate data refresh on upload completion
  refreshDataAfterUploadBatch: async (): Promise<void> => {
    const now = Date.now();

    // Prevent spam refreshing
    if (
      refreshState.isRefreshing ||
      now - refreshState.lastRefreshAttempt < MIN_REFRESH_INTERVAL_MS
    ) {
      console.log('Refresh skipped - too frequent');
      return;
    }

    refreshState.isRefreshing = true;
    refreshState.lastRefreshAttempt = now;

    try {
      console.log('Refreshing data after upload completion...');
      // Get refreshCurrentData function from data context
      const { refreshCurrentData } = useDriveStore.getState();
      await refreshCurrentData();
      console.log('Data refresh completed successfully');
    } catch (error) {
      console.error('Upload refresh failed:', error);
    } finally {
      refreshState.isRefreshing = false;
    }
  },

  forceRefreshData: async (): Promise<void> => {
    // Clear timer
    if (refreshState.debounceTimer) {
      clearTimeout(refreshState.debounceTimer);
      refreshState.debounceTimer = null;
    }

    refreshState.isRefreshing = true;

    try {
      const { refreshCurrentData } = useDriveStore.getState();
      await refreshCurrentData();
    } catch (error) {
      console.error('Force refresh failed:', error);
      throw error; // Re-throw for caller to handle
    } finally {
      refreshState.isRefreshing = false;
      refreshState.lastRefreshAttempt = Date.now();
    }
  },
}));
