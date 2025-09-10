import { apiS3 } from '@/services/byo-s3-api';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { generateS3Key } from '@/features/upload/utils/generate-s3-key';

export interface RenameOptions {
  onProgress?: (progress: { status: 'renaming' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

class RenameService {
  async renameFile(
    file: FileItem,
    newName: string,
    currentPath: string,
    options: RenameOptions = {}
  ): Promise<void> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'renaming' });

      // Use the actual file key from S3 instead of constructing it
      const oldKey = file.Key;
      if (!oldKey) {
        throw new Error('File key is missing');
      }

      // Construct the new key by replacing the filename part
      const pathParts = oldKey.split('/');
      pathParts[pathParts.length - 1] = newName; // Replace the last part (filename) with new name
      const newKey = pathParts.join('/');

      // Use moveFile method which handles the copy/delete operations
      await apiS3.moveFile({
        oldKey,
        newKey,
      });

      onProgress?.({ status: 'success' });
      onComplete?.();
    } catch (error) {
      console.error('renameService.renameFile error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to rename file';
      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  async renameFolder(
    folder: Folder,
    newName: string,
    currentPath: string,
    options: RenameOptions = {}
  ): Promise<void> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'renaming' });

      // Normalize paths - remove leading slashes
      let normalizedCurrentPath = currentPath || '';
      if (normalizedCurrentPath.startsWith('/')) {
        normalizedCurrentPath = normalizedCurrentPath.slice(1);
      }

      const oldPrefix = folder.Prefix || `${normalizedCurrentPath}${folder.name}/`;
      const newPrefix = normalizedCurrentPath
        ? `${normalizedCurrentPath}${newName}/`
        : `${newName}/`;

      const result = await apiS3.renameFolder({
        oldPrefix,
        newPrefix,
        onProgress: (progress) => {
          // Convert S3 progress to our format
          if (progress.processed === progress.total) {
            onProgress?.({ status: 'success' });
          }
        },
      });

      if (result.processed === result.total) {
        onComplete?.();
      } else {
        throw new Error('Rename operation failed');
      }
    } catch (error) {
      console.error('renameService.renameFolder error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to rename folder';
      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  async checkFileExists(
    fileName: string,
    currentPath: string,
    baseFileKey?: string
  ): Promise<boolean> {
    try {
      let fileKey: string;

      if (baseFileKey) {
        // If we have a base file key (from existing file), construct new key by replacing filename
        const pathParts = baseFileKey.split('/');
        pathParts[pathParts.length - 1] = fileName;
        fileKey = pathParts.join('/');
      } else {
        // Fallback to the old method for new file creation
        let normalizedPath = currentPath || '';
        if (normalizedPath.startsWith('/')) {
          normalizedPath = normalizedPath.slice(1);
        }
        fileKey = generateS3Key(fileName, normalizedPath);
      }

      const metadata = await apiS3.fetchMetadata(fileKey);
      return metadata !== null;
    } catch {
      return false;
    }
  }

  async checkFolderExists(folderName: string, currentPath: string): Promise<boolean> {
    try {
      // Normalize currentPath to work with generateS3Key
      let normalizedPath = currentPath || '';
      if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.slice(1);
      }

      const folderPrefix = generateS3Key(`${folderName}/`, normalizedPath);
      const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1);
      return result.files.length > 0 || result.folders.length > 0;
    } catch {
      return false;
    }
  }

  generateUniqueFileName(originalName: string, counter: number = 1): string {
    const lastDotIndex = originalName.lastIndexOf('.');
    let baseName: string;
    let extension: string;

    if (lastDotIndex > 0 && lastDotIndex < originalName.length - 1) {
      baseName = originalName.substring(0, lastDotIndex);
      extension = originalName.substring(lastDotIndex);
    } else {
      baseName = originalName;
      extension = '';
    }

    // Remove existing numbered suffix pattern like " (1)", " (2)", etc.
    const numberedSuffixPattern = / \(\d+\)$/;
    if (numberedSuffixPattern.test(baseName)) {
      const cleanBaseName = baseName.replace(numberedSuffixPattern, '');
      baseName = cleanBaseName;
    }

    const result = `${baseName} (${counter})${extension}`;
    return result;
  }

  generateUniqueFolderName(originalName: string, counter: number = 1): string {
    // Remove existing numbered suffix pattern like " (1)", " (2)", etc.
    const numberedSuffixPattern = / \(\d+\)$/;
    let baseName = originalName;
    if (numberedSuffixPattern.test(baseName)) {
      const cleanBaseName = baseName.replace(numberedSuffixPattern, '');
      baseName = cleanBaseName;
    }

    const result = `${baseName} (${counter})`;
    return result;
  }

  async findUniqueFileName(
    baseName: string,
    currentPath: string,
    baseFileKey?: string
  ): Promise<string> {
    let counter = 1;
    let uniqueName: string;

    do {
      uniqueName = this.generateUniqueFileName(baseName, counter);
      const exists = await this.checkFileExists(uniqueName, currentPath, baseFileKey);
      if (!exists) {
        return uniqueName;
      }
      counter++;
    } while (counter <= 100);

    const timestamp = Date.now();
    const lastDotIndex = baseName.lastIndexOf('.');
    if (lastDotIndex > 0) {
      const name = baseName.substring(0, lastDotIndex);
      const ext = baseName.substring(lastDotIndex);
      return `${name} (${timestamp})${ext}`;
    }
    return `${baseName} (${timestamp})`;
  }

  async findUniqueFolderName(baseName: string, currentPath: string): Promise<string> {
    let counter = 1;
    let uniqueName: string;

    do {
      uniqueName = this.generateUniqueFolderName(baseName, counter);
      const exists = await this.checkFolderExists(uniqueName, currentPath);
      if (!exists) {
        return uniqueName;
      }
      counter++;
    } while (counter <= 100);

    const timestamp = Date.now();
    return `${baseName} (${timestamp})`;
  }
}

export const renameService = new RenameService();
