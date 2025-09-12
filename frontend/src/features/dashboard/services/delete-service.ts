import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { BYOS3ApiProvider } from '@opndrive/s3-api';

export interface DeleteOptions {
  onProgress?: (progress: { status: 'deleting' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

class DeleteService {
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  async deleteFile(file: FileItem, options: DeleteOptions = {}): Promise<void> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'deleting' });

      const key = file.Key || file.name;

      await this.api.deleteFile(key);

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

      const structure = await this.api.fetchDirectoryStructure(normalizedKey);

      const deletePromises: Promise<void>[] = [];

      if (structure.files) {
        for (const file of structure.files) {
          if (file.Key) {
            deletePromises.push(this.api.deleteFile(file.Key));
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

      await this.api.deleteFile(normalizedKey);

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
    const structure = await this.api.fetchDirectoryStructure(prefix);

    const deletePromises: Promise<void>[] = [];

    if (structure.files) {
      for (const file of structure.files) {
        if (file.Key) {
          deletePromises.push(this.api.deleteFile(file.Key));
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
      await this.api.deleteFile(prefix);
    }
  }
}

export const createDeleteService = (api: BYOS3ApiProvider) => {
  return new DeleteService(api);
};
