/**
 * Utility functions for cleaning up upload-related storage
 * These can be called from browser console for debugging/maintenance
 */

// Make cleanup functions available globally for debugging
declare global {
  interface Window {
    cleanupUploads: () => void;
    forceCleanupUploads: () => void;
    showUploadDebugInfo: () => void;
  }
}

export const setupCleanupUtils = () => {
  if (typeof window === 'undefined') return;

  // Regular cleanup
  window.cleanupUploads = () => {
    import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
      persistentUploaderStorage.cleanupStaleLocalStorage();
    });
  };

  // Force cleanup of ALL upload-related entries
  window.forceCleanupUploads = () => {
    import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
      persistentUploaderStorage.forceCleanupAllUploads();
    });
  };

  // Show debug info
  window.showUploadDebugInfo = () => {
    import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
      persistentUploaderStorage.getDebugInfo();
      // Debug info retrieved but not logged to console
    });
  };
};
