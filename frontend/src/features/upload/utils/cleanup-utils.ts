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
      console.log('✅ Cleanup completed');
    });
  };

  // Force cleanup of ALL upload-related entries
  window.forceCleanupUploads = () => {
    import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
      persistentUploaderStorage.forceCleanupAllUploads();
      console.log('✅ Force cleanup completed');
    });
  };

  // Show debug info
  window.showUploadDebugInfo = () => {
    import('../services/persistent-uploader-storage').then(({ persistentUploaderStorage }) => {
      const debugInfo = persistentUploaderStorage.getDebugInfo();
      console.log('🔍 Upload Debug Info:', debugInfo);

      // Show localStorage entries
      console.log('📦 Upload-related localStorage entries:');
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('upload:') || key.includes('upload-'))) {
          console.log(`  ${key}: ${localStorage.getItem(key)?.substring(0, 100)}...`);
        }
      }
    });
  };

  console.log('🛠️  Upload cleanup utils loaded. Available commands:');
  console.log('   window.cleanupUploads() - Clean stale entries');
  console.log('   window.forceCleanupUploads() - Force cleanup ALL upload entries');
  console.log('   window.showUploadDebugInfo() - Show debug information');
};
