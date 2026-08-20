import { useCallback } from 'react';
import { useFilePreview } from '@/context/file-preview-context';
import { PreviewableFile, toPreviewableFile } from '@/types/file-preview';
import { FileItem } from '@/features/dashboard/types/file';

export function useFilePreviewActions() {
  const { openPreview } = useFilePreview();

  const convertFileItemToPreviewable = useCallback(
    (file: FileItem): PreviewableFile => toPreviewableFile(file),
    []
  );

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
