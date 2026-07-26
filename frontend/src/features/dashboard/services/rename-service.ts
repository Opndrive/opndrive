import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { generateS3Key } from '@/features/upload/utils/generate-s3-key';
import { BYOS3ApiProvider } from '@opndrive/s3-api';

export interface RenameOptions {
  onProgress?: (progress: { status: 'renaming' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

/**
 * @opndrive/s3-api 2.7.0 rewrites renameFolder to copy-all -> verify ->
 * delete-all with retry (see #74) and changes its return shape from
 * `{ total, processed }` to a rich result carrying per-object errors. The
 * installed 2.6.0 still runs the old copy-then-delete-per-key algorithm and
 * resolves the legacy shape - detected here rather than assumed, so this file
 * degrades gracefully instead of crashing against whatever is actually
 * installed. Once frontend/package.json depends on ^2.7.0, delete everything
 * below down to the class and read `result.errors` / `result.completed`
 * directly.
 */
interface RenameFolderErrorLike {
  key: string;
  code?: string;
  message?: string;
}

interface NormalizedRenameResult {
  completed: boolean;
  totalKeys: number;
  errors: RenameFolderErrorLike[];
  /** False when running against the pre-2.7.0 algorithm, which has no per-object error detail and is not safe to blindly retry. */
  reliable: boolean;
}

function isRenameFolderError(v: unknown): v is RenameFolderErrorLike {
  return !!v && typeof v === 'object' && typeof (v as Record<string, unknown>).key === 'string';
}

function normalizeRenameResult(raw: unknown): NormalizedRenameResult {
  const candidate = (raw ?? {}) as Record<string, unknown>;

  if (Array.isArray(candidate.errors)) {
    return {
      completed: candidate.completed === true,
      totalKeys: typeof candidate.totalKeys === 'number' ? candidate.totalKeys : 0,
      errors: candidate.errors.filter(isRenameFolderError),
      reliable: true,
    };
  }

  // Legacy { total, processed } shape.
  const total = typeof candidate.total === 'number' ? candidate.total : 0;
  const processed = typeof candidate.processed === 'number' ? candidate.processed : 0;
  return {
    completed: processed === total,
    totalKeys: total,
    errors: [],
    reliable: false,
  };
}

let warnedAboutLegacyRenameFolder = false;

function warnLegacyRenameFolderOnce(): void {
  if (warnedAboutLegacyRenameFolder) return;
  warnedAboutLegacyRenameFolder = true;
  console.warn(
    '[opndrive] The installed @opndrive/s3-api predates 2.7.0, so folder renames ' +
      'still use the old copy-then-delete-per-key algorithm, which can leave a ' +
      'folder split across both prefixes if interrupted partway through. ' +
      'Upgrade to ^2.7.0.'
  );
}

function describeRenameFailures(errors: RenameFolderErrorLike[], total: number): string {
  const first = errors[0];
  if (!first) return 'Rename did not fully complete.';
  const parts = [first.key];
  if (first.code) parts.push(first.code);
  if (first.message) parts.push(first.message);
  return (
    `${errors.length} of ${total} object(s) failed during rename. ` +
    `First failure: ${parts.join(' - ')}`
  );
}

class RenameService {
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

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
      await this.api.moveFile({
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

      // Success is decided only from the final settled result, not from a
      // mid-flight progress signal - the new algorithm runs in phases
      // (copying, verifying, deleting), and "processed === total" can be true
      // at the end of the copy phase while deletion of the old keys hasn't
      // started yet.
      const rawResult = await this.api.renameFolder({ oldPrefix, newPrefix });
      const result = normalizeRenameResult(rawResult);
      if (!result.reliable) warnLegacyRenameFolderOnce();

      if (result.completed) {
        onProgress?.({ status: 'success' });
        onComplete?.();
      } else {
        throw new Error(describeRenameFailures(result.errors, result.totalKeys));
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

      const metadata = await this.api.fetchMetadata(fileKey);
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
      const result = await this.api.fetchDirectoryStructure(folderPrefix, 1);
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

export const createRenameService = (api: BYOS3ApiProvider) => {
  return new RenameService(api);
};
