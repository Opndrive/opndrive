'use client';

import { useState, useCallback } from 'react';
import { generateUniqueFolderName } from '@/features/upload/utils/unique-filename';
import { useDriveStore } from '@/context/data-context';
import { getParentPrefix } from '@/features/folder-navigation/folder-navigation';
import { generateS3Key } from '@/features/upload/utils/generate-s3-key';
import { describeFolderNameError } from '@/features/upload/utils/folder-name';
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

  const addFolder = useDriveStore((state) => state.addFolder);

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

      const nameError = describeFolderNameError(folderName);
      if (nameError) {
        throw new Error(nameError);
      }

      // Written exactly as typed. This used to create a sanitized name instead,
      // which also meant the duplicate check above ran against a different key
      // than the one being created.
      const name = folderName.trim();
      const folderKey = generateS3Key(`${name}/`, currentPath);

      // The row goes in before the request. One call decides whether this
      // folder exists, so a failure means it provably does not and the row
      // comes straight back out.
      //
      // The prefix is read back off the key that will actually be written
      // rather than from currentPath, so there is only ever one opinion about
      // where this folder lives - generateS3Key strips a leading slash and
      // currentPath may carry one.
      const undoRow = addFolder(getParentPrefix(folderKey), name);

      try {
        await apiS3.createFolder(folderKey);
      } catch (error) {
        undoRow();
        throw error;
      }

      onFolderCreated?.(name);
    },
    [currentPath, addFolder, onFolderCreated, apiS3]
  );

  // Handle folder creation with duplicate checking
  const handleFolderCreation = useCallback(
    async (rawFolderName: string): Promise<void> => {
      if (!apiS3) throw new Error('S3 API is not available yet.');

      // Normalise once so the existence check, the duplicate prompt and the
      // key that gets written are all talking about the same name.
      const folderName = rawFolderName.trim();

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
                // createFolder has already put the row in the listing. The
                // re-read that used to follow it here was the third full
                // listing of this prefix for one folder.
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
      }
    },
    [checkFolderExists, createFolder, currentPath, apiS3]
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
