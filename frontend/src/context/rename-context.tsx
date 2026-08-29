'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { createRenameService } from '@/features/dashboard/services/rename-service';
import { useNotification } from '@/context/notification-context';
import { useDriveStore, type Revert } from '@/context/data-context';
import { PreviewLoading } from '@/components/file-preview';
import { useAuthGuard } from '@/hooks/use-auth-guard';

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

interface RenameContextType {
  // Dialog states
  renameDialog: RenameDialogState;
  duplicateDialog: RenameDuplicateDialogState;

  // Dialog actions
  showRenameDialog: (item: FileItem | Folder, type: 'file' | 'folder', currentPath: string) => void;
  hideRenameDialog: () => void;
  hideDuplicateDialog: () => void;
  handleRenameConfirm: (newName: string) => Promise<void>;

  // Rename actions
  renameFile: (file: FileItem, newName: string, currentPath: string) => Promise<void>;
  renameFolder: (folder: Folder, newName: string, currentPath: string) => Promise<void>;
  isRenaming: (itemId: string) => boolean;
}

const RenameContext = createContext<RenameContextType | undefined>(undefined);

export const RenameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  /**
   * Every hook below is declared unconditionally, and the two early returns
   * this provider needs now sit at the bottom instead of here.
   *
   * They used to come first, which made the number of hooks depend on whether
   * the session had loaded - the exact thing rules-of-hooks exists to prevent.
   * Signing out flips `isAuthenticated` on an already-mounted provider, so the
   * render after it would run one hook where the previous had run twenty:
   * "Rendered fewer hooks than expected", and the dashboard goes down with it.
   * Eighteen lint warnings were saying so.
   *
   * Memoised rather than rebuilt each render: as a bare call it was absent from
   * every dependency array below, so those callbacks captured whichever
   * instance the first render happened to make and would have kept talking to
   * the previous bucket after a switch.
   */
  const renameService = useMemo(() => (apiS3 ? createRenameService(apiS3) : null), [apiS3]);

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

  const { success, error, warning } = useNotification();

  // One selector per action rather than `useDriveStore()`, which subscribes
  // this provider - and the whole tree under it - to every write the drive
  // store makes. That was survivable while the only writes were refreshes;
  // now that each operation writes rows of its own, it would be a re-render
  // of everything per row.
  const refreshCurrentData = useDriveStore((state) => state.refreshCurrentData);
  const renameFileRow = useDriveStore((state) => state.renameFile);
  const renameFolderRow = useDriveStore((state) => state.renameFolder);

  /**
   * Shared handling for a folder rename that succeeded but left old copies
   * behind. This is a warning, not a failure - the files really did move, so
   * the optimistic rename stands and only the leftovers need looking up.
   */
  const handlePartialCleanup = useCallback(
    (message: string) => {
      warning(message, 10000);
      // Silent: the renamed rows are on screen and correct. This is here for
      // the copies that did not get cleaned up, not to redraw the page.
      refreshCurrentData({ silent: true }).catch(() => {});
    },
    [warning, refreshCurrentData]
  );

  /**
   * Renames the row before the request goes out, and hands back the undo.
   *
   * Optimistic on purpose. A rename is a copy followed by a delete, and a name
   * that only changes once both have finished is a name that appears not to
   * have changed at all for a second or two.
   *
   * Every failure path here runs the undo: the service calls `onError` before
   * it rethrows, in both of its rename methods, so that is the one place the
   * row needs putting back. A partial cleanup is deliberately not one of them -
   * the files really are at the new name, and only the old copies are in doubt.
   */
  const applyRename = useCallback(
    (item: FileItem | Folder, type: 'file' | 'folder', newName: string): Revert => {
      if (type === 'folder') {
        const prefix = (item as Folder).Prefix;
        return prefix ? renameFolderRow(prefix, newName) : () => {};
      }

      const oldKey = (item as FileItem).Key;
      if (!oldKey) return () => {};

      // The key the service builds, built the same way: the last segment of
      // the old key replaced and nothing else touched. Deriving it from
      // currentPath instead would be a second opinion about where the file is.
      const parts = oldKey.split('/');
      parts[parts.length - 1] = newName;

      return renameFileRow(oldKey, parts.join('/'));
    },
    [renameFileRow, renameFolderRow]
  );

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

  const renameFile = useCallback(
    async (file: FileItem, newName: string, currentPath: string) => {
      // No session, no service. The provider renders nothing in that state, so
      // nothing can call this - but the callback is now built before the state
      // is known, so it says what it does without one.
      if (!renameService) return;

      const fileId = file.id || file.Key || file.name;

      if (newName === file.name) {
        return;
      }

      const fileExists = await renameService.checkFileExists(newName, currentPath, file.Key);

      if (fileExists) {
        return new Promise<void>((resolve) => {
          setDuplicateDialog({
            isOpen: true,
            currentName: file.name,
            newName,
            type: 'file',
            onReplace: async () => {
              let reportedError = false;
              try {
                setActiveRenames((prev) => new Set(prev).add(fileId));

                const undoRename = applyRename(file, 'file', newName);

                await renameService.renameFile(file, newName, currentPath, {
                  onComplete: () => {
                    success(`"${file.name}" renamed to "${newName}"`);
                  },
                  onError: (errorMessage) => {
                    reportedError = true;
                    undoRename();
                    error(`Failed to rename "${file.name}": ${errorMessage}`);
                  },
                });

                hideDuplicateDialog();
                resolve();
              } catch (err) {
                console.error('Rename file error:', err);
                if (!reportedError) error(`Failed to rename "${file.name}"`);
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
              let reportedError = false;
              try {
                setActiveRenames((prev) => new Set(prev).add(fileId));

                const uniqueName = await renameService.findUniqueFileName(
                  newName,
                  currentPath,
                  file.Key
                );

                const undoRename = applyRename(file, 'file', uniqueName);

                await renameService.renameFile(file, uniqueName, currentPath, {
                  onComplete: () => {
                    success(`"${file.name}" renamed to "${uniqueName}"`);
                  },
                  onError: (errorMessage) => {
                    reportedError = true;
                    undoRename();
                    error(`Failed to rename "${file.name}": ${errorMessage}`);
                  },
                });

                hideDuplicateDialog();
                resolve();
              } catch (err) {
                console.error('Rename file error:', err);
                if (!reportedError) error(`Failed to rename "${file.name}"`);
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

      let reportedError = false;
      try {
        const undoRename = applyRename(file, 'file', newName);

        await renameService.renameFile(file, newName, currentPath, {
          onComplete: () => {
            success(`"${file.name}" renamed to "${newName}"`);
          },
          onError: (errorMessage) => {
            reportedError = true;
            undoRename();
            error(`Failed to rename "${file.name}": ${errorMessage}`);
          },
        });
      } catch (err) {
        console.error('Rename file error:', err);
        if (!reportedError) error(`Failed to rename "${file.name}"`);
      } finally {
        setActiveRenames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
      }
    },
    [success, error, applyRename, hideDuplicateDialog, renameService]
  );

  const renameFolder = useCallback(
    async (folder: Folder, newName: string, currentPath: string) => {
      if (!renameService) return;

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
              let reportedError = false;
              try {
                setActiveRenames((prev) => new Set(prev).add(folderId));

                const undoRename = applyRename(folder, 'folder', newName);

                await renameService.renameFolder(folder, newName, currentPath, {
                  onComplete: () => {
                    success(`"${folder.name}" renamed to "${newName}"`);
                  },
                  onPartialCleanup: handlePartialCleanup,
                  onError: (errorMessage) => {
                    reportedError = true;
                    undoRename();
                    error(`Failed to rename "${folder.name}": ${errorMessage}`);
                  },
                });

                hideDuplicateDialog();
                resolve();
              } catch (err) {
                console.error('Rename folder error:', err);
                // onError already surfaced the detail - don't stack a second,
                // less useful toast on top of it.
                if (!reportedError) error(`Failed to rename "${folder.name}"`);
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
              let reportedError = false;
              try {
                setActiveRenames((prev) => new Set(prev).add(folderId));

                const uniqueName = await renameService.findUniqueFolderName(newName, currentPath);

                const undoRename = applyRename(folder, 'folder', uniqueName);

                await renameService.renameFolder(folder, uniqueName, currentPath, {
                  onComplete: () => {
                    success(`"${folder.name}" renamed to "${uniqueName}"`);
                  },
                  onPartialCleanup: handlePartialCleanup,
                  onError: (errorMessage) => {
                    reportedError = true;
                    undoRename();
                    error(`Failed to rename "${folder.name}": ${errorMessage}`);
                  },
                });

                hideDuplicateDialog();
                resolve();
              } catch (err) {
                console.error('Rename folder error:', err);
                if (!reportedError) error(`Failed to rename "${folder.name}"`);
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

      let reportedError = false;
      try {
        const undoRename = applyRename(folder, 'folder', newName);

        await renameService.renameFolder(folder, newName, currentPath, {
          onComplete: () => {
            success(`"${folder.name}" renamed to "${newName}"`);
          },
          onPartialCleanup: handlePartialCleanup,
          onError: (errorMessage) => {
            reportedError = true;
            undoRename();
            error(`Failed to rename "${folder.name}": ${errorMessage}`);
          },
        });
      } catch (err) {
        console.error('Rename folder error:', err);
        if (!reportedError) error(`Failed to rename "${folder.name}"`);
      } finally {
        setActiveRenames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    },
    [success, error, applyRename, handlePartialCleanup, hideDuplicateDialog, renameService]
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renameDialog.item) {
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

  const isRenaming = useCallback(
    (itemId: string) => {
      return activeRenames.has(itemId);
    },
    [activeRenames]
  );

  const value: RenameContextType = {
    renameDialog,
    duplicateDialog,
    showRenameDialog,
    hideRenameDialog,
    hideDuplicateDialog,
    handleRenameConfirm,
    renameFile,
    renameFolder,
    isRenaming,
  };

  // Below every hook, so the count never changes between renders. See the
  // note on renameService above for what putting these first used to cost.
  if (isLoading) {
    return <PreviewLoading message="Authenticating..." />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  return <RenameContext.Provider value={value}>{children}</RenameContext.Provider>;
};

export const useRename = (): RenameContextType => {
  const context = useContext(RenameContext);
  if (!context) {
    throw new Error('useRename must be used within a RenameProvider');
  }
  return context;
};
