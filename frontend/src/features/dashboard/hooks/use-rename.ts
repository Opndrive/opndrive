import { useState, useCallback } from 'react';
import { renameService } from '@/features/dashboard/services/rename-service';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { useNotification } from '@/context/notification-context';
import { useDriveStore } from '@/context/data-context';

interface RenameDuplicateDialogState {
  isOpen: boolean;
  currentName: string;
  newName: string;
  type: 'file' | 'folder';
  onReplace: (() => void) | null;
  onKeepBoth: (() => void) | null;
}

interface RenameDialogState {
  isOpen: boolean;
  currentName: string;
  type: 'file' | 'folder';
  isRenaming: boolean;
  item: FileItem | Folder | null;
  currentPath: string;
}

export interface UseRenameReturn {
  renameFile: (file: FileItem, newName: string, currentPath: string) => Promise<void>;
  renameFolder: (folder: Folder, newName: string, currentPath: string) => Promise<void>;
  isRenaming: (itemId: string) => boolean;
  duplicateDialog: RenameDuplicateDialogState;
  hideDuplicateDialog: () => void;
  renameDialog: RenameDialogState;
  hideRenameDialog: () => void;
  showRenameDialog: (item: FileItem | Folder, type: 'file' | 'folder', currentPath: string) => void;
  handleRenameConfirm: (newName: string) => Promise<void>;
}

export const useRename = (): UseRenameReturn => {
  const [activeRenames, setActiveRenames] = useState<Set<string>>(new Set());
  const [duplicateDialog, setDuplicateDialog] = useState<RenameDuplicateDialogState>({
    isOpen: false,
    currentName: '',
    newName: '',
    type: 'file',
    onReplace: null,
    onKeepBoth: null,
  });
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
    isOpen: false,
    currentName: '',
    type: 'file',
    isRenaming: false,
    item: null,
    currentPath: '',
  });

  const { success, error } = useNotification();
  const { refreshCurrentData } = useDriveStore();

  const renameFile = useCallback(
    async (file: FileItem, newName: string, currentPath: string) => {
      const fileId = file.id || file.Key || file.name;

      const fileExists = await renameService.checkFileExists(newName, currentPath);

      if (fileExists) {
        return new Promise<void>((resolve) => {
          setDuplicateDialog({
            isOpen: true,
            currentName: file.name,
            newName,
            type: 'file',
            onReplace: async () => {
              try {
                setActiveRenames((prev) => new Set(prev).add(fileId));

                await renameService.renameFile(file, newName, currentPath, {
                  onComplete: () => {
                    success(`"${file.name}" renamed to "${newName}"`);
                    refreshCurrentData().catch(() => {});
                  },
                  onError: (errorMessage) => {
                    error(`Failed to rename "${file.name}": ${errorMessage}`);
                  },
                });

                setDuplicateDialog({
                  isOpen: false,
                  currentName: '',
                  newName: '',
                  type: 'file',
                  onReplace: null,
                  onKeepBoth: null,
                });
                resolve();
              } catch (err) {
                console.error('Rename file error:', err);
                error(`Failed to rename "${file.name}"`);
                resolve();
              } finally {
                setActiveRenames((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(fileId);
                  return newSet;
                });
              }
            },
            onKeepBoth: async () => {
              try {
                setActiveRenames((prev) => new Set(prev).add(fileId));

                const uniqueName = await renameService.findUniqueFileName(newName, currentPath);

                await renameService.renameFile(file, uniqueName, currentPath, {
                  onComplete: () => {
                    success(`"${file.name}" renamed to "${uniqueName}"`);
                    refreshCurrentData().catch(() => {});
                  },
                  onError: (errorMessage) => {
                    error(`Failed to rename "${file.name}": ${errorMessage}`);
                  },
                });

                setDuplicateDialog({
                  isOpen: false,
                  currentName: '',
                  newName: '',
                  type: 'file',
                  onReplace: null,
                  onKeepBoth: null,
                });
                resolve();
              } catch (err) {
                console.error('Rename file error:', err);
                error(`Failed to rename "${file.name}"`);
                resolve();
              } finally {
                setActiveRenames((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(fileId);
                  return newSet;
                });
              }
            },
          });
        });
      }

      setActiveRenames((prev) => new Set(prev).add(fileId));

      try {
        await renameService.renameFile(file, newName, currentPath, {
          onComplete: () => {
            success(`"${file.name}" renamed to "${newName}"`);
            refreshCurrentData().catch(() => {});
          },
          onError: (errorMessage) => {
            error(`Failed to rename "${file.name}": ${errorMessage}`);
          },
        });
      } catch (err) {
        console.error('Rename file error:', err);
        error(`Failed to rename "${file.name}"`);
      } finally {
        setActiveRenames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
      }
    },
    [success, error, refreshCurrentData]
  );

  const renameFolder = useCallback(
    async (folder: Folder, newName: string, currentPath: string) => {
      const folderId = folder.id || folder.Prefix || folder.name;

      if (newName === folder.name) {
        return;
      }

      const folderExists = await renameService.checkFolderExists(newName, currentPath);

      if (folderExists) {
        return new Promise<void>((resolve) => {
          setDuplicateDialog({
            isOpen: true,
            currentName: folder.name,
            newName,
            type: 'folder',
            onReplace: async () => {
              try {
                setActiveRenames((prev) => new Set(prev).add(folderId));

                await renameService.renameFolder(folder, newName, currentPath, {
                  onComplete: () => {
                    success(`"${folder.name}" renamed to "${newName}"`);
                    refreshCurrentData().catch(() => {});
                  },
                  onError: (errorMessage) => {
                    error(`Failed to rename "${folder.name}": ${errorMessage}`);
                  },
                });

                setDuplicateDialog({
                  isOpen: false,
                  currentName: '',
                  newName: '',
                  type: 'folder',
                  onReplace: null,
                  onKeepBoth: null,
                });
                resolve();
              } catch (err) {
                console.error('Rename folder error:', err);
                error(`Failed to rename "${folder.name}"`);
                resolve();
              } finally {
                setActiveRenames((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(folderId);
                  return newSet;
                });
              }
            },
            onKeepBoth: async () => {
              try {
                setActiveRenames((prev) => new Set(prev).add(folderId));

                const uniqueName = await renameService.findUniqueFolderName(newName, currentPath);

                await renameService.renameFolder(folder, uniqueName, currentPath, {
                  onComplete: () => {
                    success(`"${folder.name}" renamed to "${uniqueName}"`);
                    refreshCurrentData().catch(() => {});
                  },
                  onError: (errorMessage) => {
                    error(`Failed to rename "${folder.name}": ${errorMessage}`);
                  },
                });

                setDuplicateDialog({
                  isOpen: false,
                  currentName: '',
                  newName: '',
                  type: 'folder',
                  onReplace: null,
                  onKeepBoth: null,
                });
                resolve();
              } catch (err) {
                console.error('Rename folder error:', err);
                error(`Failed to rename "${folder.name}"`);
                resolve();
              } finally {
                setActiveRenames((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(folderId);
                  return newSet;
                });
              }
            },
          });
        });
      }

      setActiveRenames((prev) => new Set(prev).add(folderId));

      try {
        await renameService.renameFolder(folder, newName, currentPath, {
          onComplete: () => {
            success(`"${folder.name}" renamed to "${newName}"`);
            refreshCurrentData().catch(() => {});
          },
          onError: (errorMessage) => {
            error(`Failed to rename "${folder.name}": ${errorMessage}`);
          },
        });
      } catch (err) {
        console.error('Rename folder error:', err);
        error(`Failed to rename "${folder.name}"`);
      } finally {
        setActiveRenames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    },
    [success, error, refreshCurrentData]
  );

  const isRenaming = useCallback(
    (itemId: string) => {
      return activeRenames.has(itemId);
    },
    [activeRenames]
  );

  const hideDuplicateDialog = useCallback(() => {
    setDuplicateDialog({
      isOpen: false,
      currentName: '',
      newName: '',
      type: 'file',
      onReplace: null,
      onKeepBoth: null,
    });
  }, []);

  const hideRenameDialog = useCallback(() => {
    setRenameDialog({
      isOpen: false,
      currentName: '',
      type: 'file',
      isRenaming: false,
      item: null,
      currentPath: '',
    });
  }, []);

  const showRenameDialog = useCallback(
    (item: FileItem | Folder, type: 'file' | 'folder', currentPath: string) => {
      setRenameDialog({
        isOpen: true,
        currentName: item.name,
        type,
        isRenaming: false,
        item,
        currentPath,
      });
    },
    []
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renameDialog.item) {
        console.error('No item to rename');
        return;
      }

      try {
        if (renameDialog.type === 'file') {
          await renameFile(renameDialog.item as FileItem, newName, renameDialog.currentPath);
        } else {
          await renameFolder(renameDialog.item as Folder, newName, renameDialog.currentPath);
        }
        hideRenameDialog();
      } catch (error) {
        console.error('Rename failed:', error);
      }
    },
    [renameDialog, renameFile, renameFolder, hideRenameDialog]
  );

  return {
    renameFile,
    renameFolder,
    isRenaming,
    duplicateDialog,
    hideDuplicateDialog,
    renameDialog,
    hideRenameDialog,
    showRenameDialog,
    handleRenameConfirm,
  };
};
