import { useCallback } from 'react';
import { FileItem } from '../types/file';
import { Folder } from '../types/folder';
import { useDownloadActions } from './use-download';
import { useDeleteWithProgress } from './use-delete-with-progress';
import { useFilePreview } from '@/context/file-preview-context';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';
import { useMultiSelectStore } from '../stores/use-multi-select-store';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';
import { useNotification } from '@/context/notification-context';
import {
  folderFromMarker,
  isFile,
  isFolder,
  isFolderLike,
  isFolderMarker,
} from '@/shared/utils/drive-item';

interface UseMultiSelectActionsProps {
  openMultiShareDialog: (files: FileItem[]) => void;
}

export function useMultiSelectActions({ openMultiShareDialog }: UseMultiSelectActionsProps) {
  const { downloadMultipleFiles } = useDownloadActions();
  const { deleteFile, deleteFolder, batchDeleteFiles } = useDeleteWithProgress();
  const { openPreview } = useFilePreview();
  const { clearSelection } = useMultiSelectStore();
  const { error: showError } = useNotification();

  // Open multiple files in preview
  const handleOpenFiles = useCallback(
    (items: (FileItem | Folder)[]) => {
      const files = items.filter(isFile);

      if (files.length === 0) return;

      const previewableFiles = files.map((file) => ({
        id: file.id,
        name: file.name,
        key: file.Key,
        size: typeof file.Size === 'number' ? file.Size : 0,
        lastModified: file.lastModified,
        type: file.extension || getFileExtensionWithoutDot(file.name),
      }));

      // Open preview with the first file
      openPreview(previewableFiles[0], previewableFiles);

      // Don't clear selection - let user maintain selection after closing preview
    },
    [openPreview]
  );

  // Download multiple files one by one
  const handleDownloadFiles = useCallback(
    (items: (FileItem | Folder)[]) => {
      const files = items.filter(isFile);

      if (files.length === 0) return;

      // Download all files
      downloadMultipleFiles(files);

      // Clear selection after queuing downloads
      clearSelection();
    },
    [downloadMultipleFiles, clearSelection]
  );

  // Share multiple files
  const handleShareFiles = useCallback(
    (items: (FileItem | Folder)[]) => {
      const files = items.filter(isFile);

      if (files.length === 0) return;

      openMultiShareDialog(files);

      // Don't clear selection immediately - let dialog handle it when closed
    },
    [openMultiShareDialog]
  );

  // Delete multiple items (files and/or folders)
  const handleDeleteItems = useCallback(
    async (items: (FileItem | Folder)[]) => {
      if (items.length === 0) return;

      // Separate files and folders. `isFolderLike` counts a folder marker - an
      // object whose key ends in a slash - as a folder, so a selection holding
      // one never takes the files-only batch path below.
      const files = items.filter(isFile);
      const folders = items.filter(isFolderLike);

      // Show confirmation dialog
      const itemNames = items.map((item) => `"${item.name}"`).join(', ');
      const confirmMessage =
        items.length === 1
          ? `${itemNames} will be deleted forever. This action cannot be undone.`
          : `${items.length} items will be deleted forever. This action cannot be undone.\n\nItems: ${itemNames}`;

      const confirmDelete = await confirmAction({
        title: items.length === 1 ? 'Delete forever?' : `Delete ${items.length} items forever?`,
        description: confirmMessage,
        confirmLabel: 'Delete forever',
        destructive: true,
      });

      if (!confirmDelete) return;

      // Clear selection immediately after confirmation
      clearSelection();

      // What could not be deleted, so the caller hears about it. Every branch
      // below used to swallow its failure, which meant a delete that removed
      // nothing looked exactly like one that worked.
      const failed: string[] = [];

      // If only files are selected, use batch delete for better performance
      if (files.length > 0 && folders.length === 0) {
        try {
          await batchDeleteFiles(files);
        } catch (error) {
          console.error('Failed to batch delete files:', error);
          failed.push(...files.map((file) => file.name || 'an unnamed file'));
        }
      } else {
        // Delete items one by one (mixed files and folders, or only folders)
        for (const item of items) {
          try {
            if (isFolder(item)) {
              await deleteFolder(item);
            } else if (isFolderMarker(item)) {
              // A folder written as an object rather than inferred from a
              // delimiter. This branch used to be missing, so the marker went
              // to deleteFile - which removed the marker and left everything
              // beneath it orphaned, still stored and no longer listable.
              await deleteFolder(folderFromMarker(item));
            } else if (isFile(item)) {
              await deleteFile(item);
            } else {
              // Neither branch matched. The loop used to end here silently,
              // with the confirmation already accepted and the selection
              // already cleared - so the interface reported a deletion that
              // never happened.
              throw new Error('Item carries neither a file key nor a folder prefix');
            }
          } catch (error) {
            console.error(`Failed to delete ${item.name}:`, error);
            failed.push(item.name || 'an unnamed item');
          }
        }
      }

      if (failed.length > 0) {
        showError(
          failed.length === 1
            ? `Could not delete "${failed[0]}".`
            : `Could not delete ${failed.length} of ${items.length} items: ${failed
                .map((name) => `"${name}"`)
                .join(', ')}.`
        );
      }
    },
    [deleteFile, deleteFolder, batchDeleteFiles, clearSelection, showError]
  );

  return {
    handleOpenFiles,
    handleDownloadFiles,
    handleShareFiles,
    handleDeleteItems,
  };
}
