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

/**
 * How many names the confirmation lists before the rest become a count.
 *
 * Eight fits a dialog without scrolling it. There was no cap at all before, so
 * selecting four hundred files built a four-hundred-name paragraph and asked
 * the user to read it.
 */
const MAX_LISTED_NAMES = 8;

/**
 * What is about to be deleted, one name per line.
 *
 * Comma-joined and quoted, the way this used to read, eight names arrive as a
 * single run-on line that has to be parsed rather than scanned - which is the
 * one thing a destructive confirmation must not ask of anyone.
 *
 * Folders keep a trailing slash. In a plain list it is the only thing that says
 * a name is a folder, and a folder is the one entry here that takes more than
 * itself with it.
 */
function listNames(items: (FileItem | Folder)[], folders: readonly (FileItem | Folder)[]): string {
  // Not Folder[]: a folder marker is a FileItem that happens to be a folder,
  // which is exactly why isFolderLike is not a type predicate. Identity is all
  // this needs anyway - the set only answers "was this one of them?".
  const isFolder = new Set<FileItem | Folder>(folders);

  const named = items
    .slice(0, MAX_LISTED_NAMES)
    .map((item) => (isFolder.has(item) ? `${item.name}/` : item.name));

  const remaining = items.length - named.length;

  return remaining > 0 ? `${named.join('\n')}\nand ${remaining} more` : named.join('\n');
}

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
      const single = items.length === 1 ? items[0]! : undefined;

      // Deleting a folder takes everything underneath it. The single-folder
      // dialog has always said so; this one never did, so a selection with a
      // folder in it asked for confirmation without mentioning the part that
      // cannot be taken back - and the count alone gives no hint that one of
      // those five items might hold ten thousand more.
      const consequence =
        folders.length > 0
          ? 'Deleting a folder also deletes everything inside it. This action cannot be undone.'
          : 'This action cannot be undone.';

      const confirmMessage = single
        ? folders.length > 0
          ? `"${single.name}" and everything inside it will be deleted forever. This action cannot be undone.`
          : `"${single.name}" will be deleted forever. This action cannot be undone.`
        : // The count is already in the title; repeating it here spent the
          // first line of the body saying nothing new.
          `${consequence}\n\n${listNames(items, folders)}`;

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
