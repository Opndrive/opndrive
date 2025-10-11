import { useCallback } from 'react';
import { FileItem } from '../types/file';

export function useMultiShareDialog() {
  const openMultiShareDialog = useCallback((files: FileItem[]) => {
    // TODO: Implement multi-share dialog
    // For now, just log the files
    console.log('Opening multi-share dialog for files:', files);
  }, []);

  return {
    openMultiShareDialog,
  };
}
