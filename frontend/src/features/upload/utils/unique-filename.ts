import { BYOS3ApiProvider } from '@opndrive/s3-api';
import { generateS3Key } from './generate-s3-key';

/**
 * Generates a unique filename by checking S3 and adding (1), (2), etc. if needed
 */
export async function generateUniqueFileName(
  apiS3: BYOS3ApiProvider,
  originalName: string,
  currentPath: string
): Promise<string> {
  const generateS3Key = (fileName: string, path: string): string => {
    let cleanPath = path;
    if (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.slice(1);
    }
    if (!cleanPath || cleanPath === '' || cleanPath === '/') {
      return fileName;
    }
    if (!cleanPath.endsWith('/')) {
      cleanPath = `${cleanPath}/`;
    }
    return `${cleanPath}${fileName}`;
  };

  const checkFileExists = async (fileName: string): Promise<boolean> => {
    try {
      const s3Key = generateS3Key(fileName, currentPath);
      const metadata = await apiS3.fetchMetadata(s3Key);
      return metadata !== null;
    } catch {
      return false;
    }
  };

  // Check if original name is available
  const originalExists = await checkFileExists(originalName);
  if (!originalExists) {
    return originalName;
  }

  // Extract name and extension
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

  // Try numbered versions
  let counter = 1;
  let uniqueName: string;

  do {
    uniqueName = `${baseName} (${counter})${extension}`;
    const exists = await checkFileExists(uniqueName);
    if (!exists) {
      return uniqueName;
    }
    counter++;
  } while (counter <= 100); // Reasonable safety limit

  // Fallback with timestamp if we somehow exhaust numbered options
  const timestamp = Date.now();
  return `${baseName} (${timestamp})${extension}`;
}

/**
 * Generates a unique folder name by checking S3 and adding (1), (2), etc. if needed
 */
export async function generateUniqueFolderName(
  apiS3: BYOS3ApiProvider,
  originalName: string,
  currentPath: string
): Promise<string> {
  const checkFolderExists = async (folderName: string): Promise<boolean> => {
    try {
      // Use the same generateS3Key logic as the hook for consistency
      const folderPrefix = generateS3Key(`${folderName}/`, currentPath);
      const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1);

      // If we find any objects (files or folders) with this prefix, the folder exists
      return result.files.length > 0 || result.folders.length > 0;
    } catch {
      return false;
    }
  };

  // Check if original name is available
  const originalExists = await checkFolderExists(originalName);
  if (!originalExists) {
    return originalName;
  }

  // Try numbered versions
  let counter = 1;
  let uniqueName: string;

  do {
    uniqueName = `${originalName} (${counter})`;
    const exists = await checkFolderExists(uniqueName);
    if (!exists) {
      return uniqueName;
    }
    counter++;

    // Add safety check to prevent infinite loops
    if (counter > 100) {
      break;
    }
  } while (counter <= 100); // Reasonable safety limit

  // Fallback with timestamp if we somehow exhaust numbered options
  const timestamp = Date.now();
  return `${originalName} (${timestamp})`;
}
