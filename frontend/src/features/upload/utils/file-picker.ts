/**
 * Professional file picker utility for handling file and folder uploads
 * This approach is commonly used in enterprise applications
 */

export interface FilePickerOptions {
  multiple?: boolean;
  accept?: string;
  directory?: boolean;
}

export interface FilePickerResult {
  files: FileList | null;
  cancelled: boolean;
}

/**
 * Creates a file input element and triggers file selection
 * This is a more reliable approach than using refs
 */
export const pickFiles = (options: FilePickerOptions = {}): Promise<FilePickerResult> => {
  return new Promise((resolve) => {
    // Create a new input element each time for better reliability
    const input = document.createElement('input');
    input.type = 'file';

    // Track if we've already resolved to prevent multiple calls
    let isResolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    // Safe cleanup function
    const cleanup = () => {
      try {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      } catch {
        // Silently handle cleanup errors
      }
    };

    // Safe resolve function
    const safeResolve = (result: FilePickerResult) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve(result);
    };

    try {
      // Set options
      if (options.multiple) {
        input.multiple = true;
      }

      if (options.accept) {
        input.accept = options.accept;
      }

      if (options.directory) {
        (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
        (input as HTMLInputElement & { directory: boolean }).directory = true;
        input.multiple = true; // Directory selection requires multiple
      }

      // Style to make it invisible but functional
      input.style.position = 'absolute';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';

      // Handle file selection
      const handleChange = (event: Event) => {
        const target = event.target as HTMLInputElement;
        const files = target.files;

        safeResolve({
          files,
          cancelled: !files || files.length === 0,
        });
      };

      // Handle cancellation (when user clicks cancel or presses escape)
      const handleCancel = () => {
        safeResolve({
          files: null,
          cancelled: true,
        });
      };

      // Set up event listeners
      input.addEventListener('change', handleChange, { once: true });

      // Handle cancel/escape scenarios
      input.addEventListener('cancel', handleCancel, { once: true });

      // Add a reasonable timeout for folder selection (folders take longer to process)
      const timeoutDuration = options.directory ? 60000 : 30000; // 60s for folders, 30s for files
      timeoutId = setTimeout(() => {
        if (!isResolved && document.body.contains(input) && !input.files?.length) {
          handleCancel();
        }
      }, timeoutDuration);

      // Add to DOM and trigger
      document.body.appendChild(input);
      input.click();
    } catch {
      safeResolve({
        files: null,
        cancelled: true,
      });
    }
  });
};

/**
 * Convenience function for picking multiple files
 */
export const pickMultipleFiles = (accept?: string): Promise<FilePickerResult> => {
  return pickFiles({ multiple: true, accept });
};

/**
 * Convenience function for picking a single file
 */
export const pickSingleFile = (accept?: string): Promise<FilePickerResult> => {
  return pickFiles({ multiple: false, accept });
};

/**
 * Convenience function for picking a folder
 */
export const pickFolder = (): Promise<FilePickerResult> => {
  return pickFiles({ directory: true, multiple: true });
};
