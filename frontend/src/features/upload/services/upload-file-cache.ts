/**
 * Upload File Cache
 *
 * Simple, robust cache for storing File objects separately from Zustand store
 * to avoid serialization issues
 */

class UploadFileCache {
  private cache = new Map<string, File[]>();
  private metadata = new Map<string, { type: 'file' | 'folder'; createdAt: number }>();

  store(itemId: string, files: File | File[], type: 'file' | 'folder' = 'file'): void {
    const fileArray = Array.isArray(files) ? files : [files];
    this.cache.set(itemId, fileArray);
    this.metadata.set(itemId, { type, createdAt: Date.now() });
  }

  get(itemId: string): File[] | null {
    return this.cache.get(itemId) || null;
  }

  getSingle(itemId: string): File | null {
    const files = this.cache.get(itemId);
    return files && files.length > 0 ? files[0] : null;
  }

  has(itemId: string): boolean {
    return this.cache.has(itemId);
  }

  remove(itemId: string): void {
    this.cache.delete(itemId);
    this.metadata.delete(itemId);
  }

  clear(): void {
    this.cache.clear();
    this.metadata.clear();
  }

  // Clean up old entries (older than 6 hours for active uploads, 1 hour for others)
  cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;

    for (const [itemId, meta] of this.metadata.entries()) {
      // Check if this upload is still active in the store
      const isActiveUpload = this.isUploadActive(itemId);

      const cutoffTime = isActiveUpload ? sixHoursAgo : oneHourAgo;

      if (meta.createdAt < cutoffTime) {
        this.remove(itemId);
      }
    }
  }

  // Helper to check if upload is still active
  private isUploadActive(itemId: string): boolean {
    try {
      // Try to access the upload store to check if this upload is still active
      if (typeof window !== 'undefined' && window.__upload_store_check) {
        return window.__upload_store_check(itemId);
      }
      return false;
    } catch {
      return false;
    }
  }

  getSize(): number {
    return this.cache.size;
  }

  getAllItemIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

export const uploadFileCache = new UploadFileCache();

// Periodic cleanup every 30 minutes
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      uploadFileCache.cleanup();
    },
    30 * 60 * 1000
  );
}
