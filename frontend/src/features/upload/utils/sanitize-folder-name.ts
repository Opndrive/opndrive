/**
 * Sanitizes folder name for S3 compatibility
 * Removes or replaces characters that are not allowed in S3 object keys
 */
export const sanitizeFolderName = (folderName: string): string => {
  // Remove leading/trailing whitespace
  let sanitized = folderName.trim();

  // Replace invalid characters with underscores
  // S3 allows: alphanumeric, !, -, _, ., *, ', (, ), and /
  // Include parentheses for proper duplicate naming like "test (1)"
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-_.\s()]/g, '_');

  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Replace spaces with underscores (optional, depending on preference)
  // sanitized = sanitized.replace(/\s/g, '_');

  // Ensure it doesn't start or end with a dot (which can cause issues)
  sanitized = sanitized.replace(/^\.+|\.+$/g, '');

  // Ensure it's not empty after sanitization
  if (!sanitized) {
    sanitized = 'untitled_folder';
  }

  return sanitized;
};

/**
 * Validates if a folder name is safe for S3
 */
export const isValidFolderName = (folderName: string): boolean => {
  if (!folderName || folderName.trim().length === 0) {
    return false;
  }

  // Check for invalid characters
  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(folderName)) {
    return false;
  }

  // Check for reserved names on some systems
  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];
  if (reservedNames.includes(folderName.toUpperCase())) {
    return false;
  }

  return true;
};
