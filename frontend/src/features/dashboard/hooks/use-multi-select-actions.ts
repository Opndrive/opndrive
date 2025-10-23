import { useCallback } from 'react';
import { FileItem } from '../types/file';
import { Folder } from '../types/folder';
import { useDownload } from './use-download';
import { useDeleteWithProgress } from './use-delete-with-progress';
import { useFilePreview } from '@/context/file-preview-context';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';
import { useMultiSelectStore } from '../stores/use-multi-select-store';

interface UseMultiSelectActionsProps {
  openMultiShareDialog: (files: FileItem[]) => void;
}

export function useMultiSelectActions({ openMultiShareDialog }: UseMultiSelectActionsProps) {
  const { downloadMultipleFiles } = useDownload();
  const { deleteFile, deleteFolder, batchDeleteFiles } = useDeleteWithProgress();
  const { openPreview } = useFilePreview();
  const { clearSelection } = useMultiSelectStore();

  // Open multiple files in preview
  const handleOpenFiles = useCallback(
    (items: (FileItem | Folder)[]) => {
      // Filter only files (not folders)
      const files = items.filter(
        (item) => 'Key' in item && item.Key && !item.Key.endsWith('/')
      ) as FileItem[];

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
      // Filter only files (not folders)
      const files = items.filter(
        (item) => 'Key' in item && item.Key && !item.Key.endsWith('/')
      ) as FileItem[];

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
      // Filter only files (not folders)
      const files = items.filter(
        (item) => 'Key' in item && item.Key && !item.Key.endsWith('/')
      ) as FileItem[];

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

      // Separate files and folders
      const files = items.filter(
        (item) => 'Key' in item && item.Key && !item.Key.endsWith('/')
      ) as FileItem[];
      const folders = items.filter((item) => 'Prefix' in item && item.Prefix) as Folder[];

      // Show confirmation dialog
      const itemNames = items.map((item) => `"${item.name}"`).join(', ');
      const confirmMessage =
        items.length === 1
          ? `Are you sure you want to delete ${itemNames} forever? This action cannot be undone.`
          : `Are you sure you want to delete ${items.length} items forever? This action cannot be undone.\n\nItems: ${itemNames}`;

      const confirmDelete = window.confirm(confirmMessage);

      if (!confirmDelete) return;

      // Clear selection immediately after confirmation
      clearSelection();

      // If only files are selected, use batch delete for better performance
      if (files.length > 0 && folders.length === 0) {
        try {
          await batchDeleteFiles(files);
        } catch (error) {
          console.error('Failed to batch delete files:', error);
        }
      } else {
        // Delete items one by one (mixed files and folders, or only folders)
        for (const item of items) {
          try {
            if ('Key' in item && item.Key) {
              // It's a file
              await deleteFile(item as FileItem);
            } else if ('Prefix' in item && item.Prefix) {
              // It's a folder
              await deleteFolder(item as Folder);
            }
          } catch (error) {
            console.error(`Failed to delete ${item.name}:`, error);
          }
        }
      }
    },
    [deleteFile, deleteFolder, batchDeleteFiles, clearSelection]
  );

  return {
    handleOpenFiles,
    handleDownloadFiles,
    handleShareFiles,
    handleDeleteItems,
  };
}
