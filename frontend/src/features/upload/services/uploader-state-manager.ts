/**
 * Uploader State Manager
 *
 * Centralized, thread-safe manager for upload instances and their state.
 * Ensures uploaders are never accide  forceRemove(itemId: string, _reason: string = 'force'): void {
    this.uploaders.delete(itemId);
  }deleted and provides debugging capabilities.
 */

import { MultipartUploader } from '@opndrive/s3-api';

export interface UploaderInfo {
  uploader: MultipartUploader; // The actual S3 uploader instance
  status: 'uploading' | 'paused' | 'completed' | 'cancelled' | 'error';
  createdAt: number;
  lastActivity: number;
  progress: number;
  metadata?: Record<string, unknown>;
}

class UploaderStateManager {
  private uploaders = new Map<string, UploaderInfo>();
  private debugMode = true;

  /**
   * Store an uploader instance with its metadata
   */
  store(
    itemId: string,
    uploader: MultipartUploader,
    initialStatus: UploaderInfo['status'] = 'uploading'
  ): void {
    const now = Date.now();
    const info: UploaderInfo = {
      uploader,
      status: initialStatus,
      createdAt: now,
      lastActivity: now,
      progress: 0,
      metadata: {},
    };

    this.uploaders.set(itemId, info);
  }

  /**
   * Get uploader instance (never returns null accidentally)
   */
  get(itemId: string): MultipartUploader | null {
    const info = this.uploaders.get(itemId);
    if (this.debugMode && !info) {
      console.warn(
        `[UploaderManager] No uploader found for ${itemId}. Available: ${this.getActiveIds()}`
      );
    }
    return info?.uploader || null;
  }

  /**
   * Get full uploader info
   */
  getInfo(itemId: string): UploaderInfo | null {
    return this.uploaders.get(itemId) || null;
  }

  /**
   * Update uploader status (NEVER deletes uploader unless explicitly requested)
   */
  updateStatus(itemId: string, status: UploaderInfo['status'], progress?: number): void {
    const info = this.uploaders.get(itemId);
    if (!info) {
      console.warn(`[UploaderManager] Cannot update status for ${itemId}: uploader not found`);
      return;
    }

    info.status = status;
    info.lastActivity = Date.now();
    if (progress !== undefined) {
      info.progress = progress;
    }

    // Only remove uploader if explicitly completed or cancelled
    if (status === 'completed' || status === 'cancelled') {
      // Use setTimeout to ensure cleanup happens after all current operations
      setTimeout(() => this.safeRemove(itemId, status), 100);
    }
  }

  /**
   * Update progress without changing status
   */
  updateProgress(itemId: string, progress: number): void {
    const info = this.uploaders.get(itemId);
    if (info) {
      info.progress = progress;
      info.lastActivity = Date.now();
    }
  }

  /**
   * Check if uploader exists
   */
  has(itemId: string): boolean {
    return this.uploaders.has(itemId);
  }

  /**
   * Get all active uploader IDs
   */
  getActiveIds(): string[] {
    return Array.from(this.uploaders.keys());
  }

  /**
   * Get uploaders by status
   */
  getByStatus(status: UploaderInfo['status']): Map<string, UploaderInfo> {
    const result = new Map<string, UploaderInfo>();
    for (const [itemId, info] of this.uploaders) {
      if (info.status === status) {
        result.set(itemId, info);
      }
    }
    return result;
  }

  /**
   * Safe removal with validation
   */
  private safeRemove(itemId: string, _reason: string): void {
    const info = this.uploaders.get(itemId);
    if (!info) {
      return;
    }

    // Only remove if status is truly final
    if (info.status === 'completed' || info.status === 'cancelled' || info.status === 'error') {
      this.uploaders.delete(itemId);
    } else {
      if (this.debugMode) {
        console.warn(
          `[UploaderManager] Refused to remove ${itemId}: status is ${info.status}, not final`
        );
      }
    }
  }

  /**
   * Force remove (use only in error cases)
   */
  forceRemove(itemId: string, _reason: string = 'forced'): void {
    this.uploaders.delete(itemId);
  }

  /**
   * Clear all uploaders (use only on app reset)
   */
  clear(): void {
    this.uploaders.clear();
  }

  /**
   * Get debug info
   */
  getDebugInfo(): Record<string, unknown> {
    const info: Record<string, unknown> = {};
    for (const [itemId, uploaderInfo] of this.uploaders) {
      info[itemId] = {
        status: uploaderInfo.status,
        progress: uploaderInfo.progress,
        createdAt: new Date(uploaderInfo.createdAt).toISOString(),
        lastActivity: new Date(uploaderInfo.lastActivity).toISOString(),
        ageMs: Date.now() - uploaderInfo.createdAt,
      };
    }
    return info;
  }

  /**
   * Enable/disable debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
}

// Export singleton instance
export const uploaderStateManager = new UploaderStateManager();
