import { useCallback } from 'react';
import { useFilePreview } from '@/context/file-preview-context';
import { PreviewableFile } from '@/types/file-preview';
import { FileItem } from '@/features/dashboard/types/file';

export function useFilePreviewActions() {
  const { openPreview } = useFilePreview();

  const convertFileItemToPreviewable = useCallback((file: FileItem): PreviewableFile => {
    return {
      id: file.id,
      name: file.name,
      key: file.Key || file.name, // Use Key from S3 or fallback to name
      size: typeof file.Size === 'number' ? file.Size : 0, // Size from S3
      type: file.extension || '',
      lastModified: file.LastModified || file.lastModified,
    };
  }, []);

  const convertFileItemsToPreviewable = useCallback(
    (files: FileItem[]): PreviewableFile[] => {
      return files.map(convertFileItemToPreviewable);
    },
    [convertFileItemToPreviewable]
  );

  const openFilePreview = useCallback(
    (file: FileItem, allFiles?: FileItem[]) => {
      const previewableFile = convertFileItemToPreviewable(file);
      const previewableFiles = allFiles
        ? convertFileItemsToPreviewable(allFiles)
        : [previewableFile];

      openPreview(previewableFile, previewableFiles);
    },
    [convertFileItemToPreviewable, convertFileItemsToPreviewable, openPreview]
  );

  return {
    openFilePreview,
    convertFileItemToPreviewable,
    convertFileItemsToPreviewable,
  };
}
