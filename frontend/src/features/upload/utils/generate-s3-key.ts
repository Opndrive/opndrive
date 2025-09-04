/**
 * Generates S3 object key from file name and current path
 * Handles path normalization and ensures clean S3 key format
 */
export const generateS3Key = (fileName: string, currentPath: string): string => {
  // Remove leading slash and clean the path
  let cleanPath = currentPath;

  // Remove leading slash if present
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }

  // If path is empty or just root, don't add any prefix
  if (!cleanPath || cleanPath === '' || cleanPath === '/') {
    return fileName;
  }

  // Ensure path ends with slash for proper key formation
  if (!cleanPath.endsWith('/')) {
    cleanPath += '/';
  }

  return `${cleanPath}${fileName}`;
};
