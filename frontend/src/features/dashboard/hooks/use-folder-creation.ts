'use client';

import { useState, useCallback } from 'react';
import { generateUniqueFolderName } from '@/features/upload/utils/unique-filename';
import { useDriveStore } from '@/context/data-context';
import { generateS3Key } from '@/features/upload/utils/generate-s3-key';
import {
  sanitizeFolderName,
  isValidFolderName,
} from '@/features/upload/utils/sanitize-folder-name';
import { useAuthGuard } from '@/hooks/use-auth-guard';

interface UseFolderCreationOptions {
  currentPath: string;
  onFolderCreated?: (folderName: string) => void;
}

interface DuplicateDialogState {
  isOpen: boolean;
  folderName: string;
  onReplace: (() => void) | null;
  onKeepBoth: (() => void) | null;
}

export function useFolderCreation({ currentPath, onFolderCreated }: UseFolderCreationOptions) {
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateDialogState>({
    isOpen: false,
    folderName: '',
    onReplace: null,
    onKeepBoth: null,
  });

  const { fetchData, refreshCurrentData } = useDriveStore();

  const { apiS3 } = useAuthGuard();

  if (!apiS3) {
    return {
      handleFolderCreation: async () => {
        throw new Error('S3 API is not available yet.');
      },
      duplicateDialog,
      hideDuplicateDialog: () => {
        setDuplicateDialog({
          isOpen: false,
          folderName: '',
          onReplace: null,
          onKeepBoth: null,
        });
      },
    };
  }

  // Check if folder already exists
  const checkFolderExists = useCallback(
    async (folderName: string): Promise<boolean> => {
      try {
        // Create a test path to check if folder exists
        const folderPrefix = generateS3Key(`${folderName}/`, currentPath);
        const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1);

        // If we find any objects with this prefix, the folder exists
        return result.files.length > 0 || result.folders.length > 0;
      } catch {
        return false;
      }
    },
    [currentPath]
  );

  // Create folder in S3
  const createFolder = useCallback(
    async (folderName: string): Promise<void> => {
      // Validate and sanitize folder name
      if (!isValidFolderName(folderName)) {
        throw new Error(
          'Invalid folder name. Please use only letters, numbers, spaces, hyphens, and underscores.'
        );
      }

      const sanitizedName = sanitizeFolderName(folderName);

      // Create the folder using the proper S3 createFolder method
      const folderKey = generateS3Key(`${sanitizedName}/`, currentPath);

      await apiS3.createFolder(folderKey);

      // Refresh the current directory to show the new folder
      await fetchData({ sync: true });

      // Use the sanitized name for the success callback
      onFolderCreated?.(sanitizedName);
    },
    [currentPath, fetchData, onFolderCreated]
  );

  // Handle folder creation with duplicate checking
  const handleFolderCreation = useCallback(
    async (folderName: string): Promise<void> => {
      const exists = await checkFolderExists(folderName);

      if (exists) {
        // Show duplicate dialog using local state
        return new Promise<void>((resolve) => {
          setDuplicateDialog({
            isOpen: true,
            folderName,
            onReplace: async () => {
              try {
                await createFolder(folderName);
                setDuplicateDialog({
                  isOpen: false,
                  folderName: '',
                  onReplace: null,
                  onKeepBoth: null,
                });
                // Refresh data to show the newly created folder
                try {
                  await refreshCurrentData();
                } catch {
                  // Don't fail folder creation if refresh fails
                }
                resolve();
              } catch (error) {
                resolve();
                throw error;
              }
            },
            onKeepBoth: async () => {
              try {
                const uniqueName = await generateUniqueFolderName(apiS3, folderName, currentPath);
                await createFolder(uniqueName);
                setDuplicateDialog({
                  isOpen: false,
                  folderName: '',
                  onReplace: null,
                  onKeepBoth: null,
                });
                // Refresh data to show the newly created folder
                try {
                  await refreshCurrentData();
                } catch {
                  // Don't fail folder creation if refresh fails
                }
                resolve();
              } catch (error) {
                resolve();
                throw error;
              }
            },
          });
        });
      } else {
        // No duplicate, create folder directly
        await createFolder(folderName);

        // Refresh data to show the newly created folder
        try {
          await refreshCurrentData();
        } catch {
          // Don't fail folder creation if refresh fails
        }
      }
    },
    [checkFolderExists, createFolder, currentPath, refreshCurrentData]
  );

  return {
    handleFolderCreation,
    duplicateDialog,
    hideDuplicateDialog: () => {
      setDuplicateDialog({
        isOpen: false,
        folderName: '',
        onReplace: null,
        onKeepBoth: null,
      });
    },
  };
}
