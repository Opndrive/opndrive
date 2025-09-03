import { apiS3 } from '@/services/byo-s3-api';

/**
 * Generates a unique filename by checking S3 and adding (1), (2), etc. if needed
 */
export async function generateUniqueFileName(
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
  } while (counter <= 1000); // Safety limit

  // Fallback with timestamp if we somehow exhaust numbered options
  const timestamp = Date.now();
  return `${baseName}_${timestamp}${extension}`;
}

/**
 * Generates a unique folder name by checking S3 and adding (1), (2), etc. if needed
 */
export async function generateUniqueFolderName(
  originalName: string,
  currentPath: string
): Promise<string> {
  const checkFolderExists = async (folderName: string): Promise<boolean> => {
    try {
      // Generate the folder prefix that would be used for this folder
      let folderPrefix = currentPath;

      // Remove leading slash if present
      if (folderPrefix.startsWith('/')) {
        folderPrefix = folderPrefix.slice(1);
      }

      // If path is empty or just root, don't add any prefix
      if (!folderPrefix || folderPrefix === '' || folderPrefix === '/') {
        folderPrefix = `${folderName}/`;
      } else {
        // Ensure path ends with slash but doesn't start with one
        if (!folderPrefix.endsWith('/')) {
          folderPrefix = `${folderPrefix}/`;
        }
        folderPrefix = `${folderPrefix}${folderName}/`;
      }

      // Use fetchDirectoryStructure to check if any objects exist with this prefix
      const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1); // Just check for 1 object

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
  } while (counter <= 1000); // Safety limit

  // Fallback with timestamp
  const timestamp = Date.now();
  return `${originalName}_${timestamp}`;
}
