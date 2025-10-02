/**
 * Persistent Uploader Storage
 *
 * A browser-based storage system that survives React hot reloads and page refreshes.
 * Uses a combination of window global and localStorage for maximum reliability.
 */

import { MultipartUploader } from '@opndrive/s3-api';

interface UploaderEntry {
  uploader: MultipartUploader;
  status: 'uploading' | 'paused' | 'completed' | 'cancelled';
  timestamp: number;
  progress: number;
}

class PersistentUploaderStorage {
  private static instance: PersistentUploaderStorage;
  private windowKey = '__OPNDRIVE_UPLOADERS__';
  private storageKey = 'opndrive_upload_state';

  constructor() {
    // Ensure we have a global storage object
    if (typeof window !== 'undefined' && !window.__opndrive_upload_storage) {
      window.__opndrive_upload_storage = new Map<string, UploaderEntry>();
    }
  }

  static getInstance(): PersistentUploaderStorage {
    if (!PersistentUploaderStorage.instance) {
      PersistentUploaderStorage.instance = new PersistentUploaderStorage();
    }
    return PersistentUploaderStorage.instance;
  }

  private getStorage(): Map<string, UploaderEntry> {
    if (typeof window === 'undefined') return new Map();

    if (!window.__opndrive_upload_storage) {
      window.__opndrive_upload_storage = new Map<string, UploaderEntry>();
    }

    return window.__opndrive_upload_storage;
  }

  store(
    itemId: string,
    uploader: MultipartUploader,
    status: UploaderEntry['status'] = 'uploading',
    progress: number = 0
  ): void {
    const storage = this.getStorage();
    const entry: UploaderEntry = {
      uploader,
      status,
      timestamp: Date.now(),
      progress,
    };

    storage.set(itemId, entry);
    this.saveStateToLocalStorage();
  }

  get(itemId: string): MultipartUploader | null {
    const storage = this.getStorage();
    const entry = storage.get(itemId);

    if (!entry) {
      return null;
    }

    return entry.uploader;
  }

  updateStatus(itemId: string, status: UploaderEntry['status'], progress?: number): void {
    const storage = this.getStorage();
    const entry = storage.get(itemId);

    if (entry) {
      entry.status = status;
      entry.timestamp = Date.now();
      if (progress !== undefined) {
        entry.progress = progress;
      }

      storage.set(itemId, entry);
      this.saveStateToLocalStorage();

      // Only remove if truly completed or cancelled
      if (status === 'completed' || status === 'cancelled') {
        // Use requestIdleCallback for better performance, fallback to setTimeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(() => this.remove(itemId, `status changed to ${status}`));
        } else {
          setTimeout(() => this.remove(itemId, `status changed to ${status}`), 1000);
        }
      }
    } else {
      console.warn(`[PERSISTENT_STORAGE] Cannot update status for ${itemId}: not found`);
    }
  }

  updateProgress(itemId: string, progress: number): void {
    const storage = this.getStorage();
    const entry = storage.get(itemId);

    if (entry) {
      entry.progress = progress;
      entry.timestamp = Date.now();
      storage.set(itemId, entry);
      // Don't save to localStorage on every progress update (too frequent)
    }
  }

  remove(itemId: string, _reason: string = 'manual'): boolean {
    const storage = this.getStorage();
    const removed = storage.delete(itemId);

    if (removed) {
      this.saveStateToLocalStorage();
    }

    return removed;
  }

  has(itemId: string): boolean {
    return this.getStorage().has(itemId);
  }

  getAll(): string[] {
    return Array.from(this.getStorage().keys());
  }

  clear(): void {
    const storage = this.getStorage();
    storage.clear();
    this.saveStateToLocalStorage();
  }

  private saveStateToLocalStorage(): void {
    try {
      const storage = this.getStorage();
      const state: Record<string, Omit<UploaderEntry, 'uploader'>> = {};

      for (const [itemId, entry] of storage.entries()) {
        state[itemId] = {
          status: entry.status,
          timestamp: entry.timestamp,
          progress: entry.progress,
        };
      }

      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[PERSISTENT_STORAGE] Failed to save state to localStorage:', error);
    }
  }

  // Clean up stale localStorage entries related to uploads
  cleanupStaleLocalStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const keysToRemove: string[] = [];

      // Find all upload-related localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('upload:') ||
            key.startsWith('opndrive_upload_state') ||
            (key.includes('upload-') && key.includes('-')) ||
            key.includes('hello/abcd/testing')) // Clean up test uploads
        ) {
          keysToRemove.push(key);
        }
      }

      // Remove stale entries
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.warn('[PERSISTENT_STORAGE] Error cleaning up stale localStorage:', error);
    }
  }

  // Force cleanup of ALL upload-related localStorage entries
  forceCleanupAllUploads(): void {
    if (typeof window === 'undefined') return;

    try {
      const keysToRemove: string[] = [];

      // More aggressive cleanup - find ALL upload-related keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('upload:') ||
            key.startsWith('opndrive_upload_state') ||
            // More specific pattern for upload item IDs (upload-timestamp-randomstring)
            /^upload-\d{13}-[a-z0-9]{8,}/.test(key) ||
            // S3-specific patterns but only if they contain upload-related info
            (key.includes('hello/') && key.includes('upload')) ||
            (key.includes('testing/') && key.includes('upload')))
        ) {
          keysToRemove.push(key);
        }
      }

      // Also clear our storage
      this.clear();

      // Remove all found entries
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.warn('[PERSISTENT_STORAGE] Error in force cleanup:', error);
    }
  }

  getDebugInfo(): Record<string, unknown> {
    const storage = this.getStorage();
    const debug: Record<string, unknown> = {};

    for (const [itemId, entry] of storage.entries()) {
      debug[itemId] = {
        status: entry.status,
        progress: entry.progress,
        timestamp: new Date(entry.timestamp).toISOString(),
        ageMs: Date.now() - entry.timestamp,
      };
    }

    return debug;
  }
}

// Export singleton instance
export const persistentUploaderStorage = PersistentUploaderStorage.getInstance();
