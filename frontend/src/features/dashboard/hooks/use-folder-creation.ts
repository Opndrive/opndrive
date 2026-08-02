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
import { folderExists, describeFolderCheckError } from '@/services/folder-existence';

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

  // Every hook below is declared unconditionally. This used to sit behind an
  // early `if (!apiS3) return ...`, which made the hook order depend on
  // whether the session had loaded yet - the thing rules-of-hooks exists to
  // prevent. The callbacks guard on apiS3 themselves instead, so the
  // "not ready" behaviour is unchanged: calling them throws.
  const checkFolderExists = useCallback(
    async (folderName: string): Promise<boolean> => {
      if (!apiS3) throw new Error('S3 API is not available yet.');

      const folderPrefix = generateS3Key(`${folderName}/`, currentPath);
      try {
        return await folderExists(apiS3, folderPrefix);
      } catch {
        // Returning false here would mean "the name is free" and we would
        // create a folder over one that may already exist. We do not know
        // either way, so stop and let the user retry.
        throw new Error(describeFolderCheckError('creating the folder'));
      }
    },
    [currentPath, apiS3]
  );

  // Create folder in S3
  const createFolder = useCallback(
    async (folderName: string): Promise<void> => {
      if (!apiS3) throw new Error('S3 API is not available yet.');

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
    [currentPath, fetchData, onFolderCreated, apiS3]
  );

  // Handle folder creation with duplicate checking
  const handleFolderCreation = useCallback(
    async (folderName: string): Promise<void> => {
      if (!apiS3) throw new Error('S3 API is not available yet.');

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
    [checkFolderExists, createFolder, currentPath, refreshCurrentData, apiS3]
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
