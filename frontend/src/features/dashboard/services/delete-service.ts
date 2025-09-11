import { apiS3 } from '@/services/byo-s3-api';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';

export interface DeleteOptions {
  onProgress?: (progress: { status: 'deleting' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

class DeleteService {
  async deleteFile(file: FileItem, options: DeleteOptions = {}): Promise<void> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'deleting' });

      const key = file.Key || file.name;

      await apiS3.deleteFile(key);

      onProgress?.({ status: 'success' });
      onComplete?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  async deleteFolder(folder: Folder, options: DeleteOptions = {}): Promise<void> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'deleting' });

      const folderKey = folder.Prefix || folder.name;
      const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

      const structure = await apiS3.fetchDirectoryStructure(normalizedKey);

      const deletePromises: Promise<void>[] = [];

      if (structure.files) {
        for (const file of structure.files) {
          if (file.Key) {
            deletePromises.push(apiS3.deleteFile(file.Key));
          }
        }
      }

      if (structure.folders) {
        for (const subFolder of structure.folders) {
          if (subFolder.Prefix) {
            deletePromises.push(this.deleteFolderRecursive(subFolder.Prefix));
          }
        }
      }

      await Promise.all(deletePromises);

      await apiS3.deleteFile(normalizedKey);

      onProgress?.({ status: 'success' });
      onComplete?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete folder';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  private async deleteFolderRecursive(prefix: string): Promise<void> {
    const structure = await apiS3.fetchDirectoryStructure(prefix);

    const deletePromises: Promise<void>[] = [];

    if (structure.files) {
      for (const file of structure.files) {
        if (file.Key) {
          deletePromises.push(apiS3.deleteFile(file.Key));
        }
      }
    }

    if (structure.folders) {
      for (const subFolder of structure.folders) {
        if (subFolder.Prefix) {
          deletePromises.push(this.deleteFolderRecursive(subFolder.Prefix));
        }
      }
    }

    await Promise.all(deletePromises);

    if (prefix.endsWith('/')) {
      await apiS3.deleteFile(prefix);
    }
  }
}

export const deleteService = new DeleteService();
