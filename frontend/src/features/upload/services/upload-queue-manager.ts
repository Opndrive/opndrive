'use client';

import { MultipartUploader } from '@opndrive/s3-api';

/**
 * Seque    if (this.activeUpload?    this.queue.unshift(resumeUpload);
    this.processQueue();emId === itemId) {
      return;
    }

    if (this.queue.some((q) => q.itemId === itemId)) {
      return;
    }oad Queue Manager
 * Handles ONE upload at a time to prevent concurrency issues
 */

export interface QueuedUpload {
  itemId: string;
  file: File;
  fileName?: string; // For renamed files (keep both scenario)
  priority: number; // Higher number = higher priority
  addedAt: number;
  targetPath?: string; // Target path for uploads to specific folders
}

export interface ActiveUpload {
  itemId: string;
  startedAt: number;
  uploader: MultipartUploader | null; // MultipartUploader instance
}

class UploadQueueManager {
  private static instance: UploadQueueManager;
  private queue: QueuedUpload[] = [];
  private activeUpload: ActiveUpload | null = null; // Only one active upload at a time
  private processingQueue = false;

  private constructor() {}

  static getInstance(): UploadQueueManager {
    if (!UploadQueueManager.instance) {
      UploadQueueManager.instance = new UploadQueueManager();
    }
    return UploadQueueManager.instance;
  }

  /**
   * Add an upload to the queue
   */
  addToQueue(upload: Omit<QueuedUpload, 'addedAt' | 'priority'>): void {
    const queuedUpload: QueuedUpload = {
      ...upload,
      priority: Date.now(), // Simple FIFO priority
      addedAt: Date.now(),
    };

    this.queue.push(queuedUpload);
    this.processQueue();
  }

  /**
   * Remove an upload from queue (when cancelled or completed)
   */
  removeFromQueue(itemId: string): void {
    this.queue = this.queue.filter((upload) => upload.itemId !== itemId);

    // If this was the active upload, clear it
    if (this.activeUpload?.itemId === itemId) {
      this.activeUpload = null;
    }
    this.processQueue();
  }

  /**
   * Pause an active upload
   */
  pauseUpload(itemId: string): void {
    if (this.activeUpload?.itemId === itemId) {
      // The uploader itself handles the pause, just clear from active
      this.activeUpload = null;
      // Process next item in queue after pause
      this.processQueue();
    }
  }

  /**
   * Resume a paused upload
   */
  resumeUpload(itemId: string, file: File, fileName?: string): void {
    // Check if this upload is already active or in queue
    if (this.activeUpload?.itemId === itemId) {
      return;
    }

    if (this.queue.some((upload) => upload.itemId === itemId)) {
      return;
    }

    // Add to front of queue with high priority
    const resumedUpload: QueuedUpload = {
      itemId,
      file,
      fileName,
      priority: Date.now() + 1000000, // High priority for resumed uploads
      addedAt: Date.now(),
    };

    // Insert at the beginning for immediate processing
    this.queue.unshift(resumedUpload);
    this.processQueue();
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      hasActiveUpload: this.activeUpload !== null,
      activeUploadId: this.activeUpload?.itemId || null,
      canStartNew: this.activeUpload === null,
    };
  }

  /**
   * Check if an upload is currently active
   */
  isUploadActive(itemId: string): boolean {
    return this.activeUpload?.itemId === itemId;
  }

  /**
   * Check if an upload is in queue
   */
  isUploadQueued(itemId: string): boolean {
    return this.queue.some((upload) => upload.itemId === itemId);
  }

  /**
   * Get position in queue (0-indexed, -1 if not in queue)
   */
  getQueuePosition(itemId: string): number {
    const index = this.queue.findIndex((upload) => upload.itemId === itemId);
    return index;
  }

  /**
   * Get estimated wait time for queued upload (in seconds)
   */
  getEstimatedWaitTime(itemId: string): number {
    const position = this.getQueuePosition(itemId);
    if (position === -1) return 0;

    // Simple estimate: each upload ahead takes 30 seconds
    return position * 30;
  }

  /**
   * Process the upload queue
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.activeUpload !== null) {
      return;
    }

    this.processingQueue = true;

    try {
      if (this.queue.length > 0) {
        // Sort queue by priority (highest first)
        this.queue.sort((a, b) => b.priority - a.priority);

        const nextUpload = this.queue.shift();
        if (nextUpload) {
          await this.startUpload(nextUpload);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Start an individual upload
   */
  private async startUpload(queuedUpload: QueuedUpload): Promise<void> {
    const { itemId, file, fileName, targetPath } = queuedUpload;

    // Mark as active
    this.activeUpload = {
      itemId,
      startedAt: Date.now(),
      uploader: null, // Will be set by the upload handler
    };

    // Dispatch event to trigger actual upload
    const event = new CustomEvent('startQueuedUpload', {
      detail: { itemId, file, fileName, targetPath },
    });
    window.dispatchEvent(event);
  }

  /**
   * Update active upload with uploader instance
   */
  setUploaderInstance(itemId: string, uploader: MultipartUploader | null): void {
    if (this.activeUpload?.itemId === itemId) {
      this.activeUpload.uploader = uploader;
    }
  }

  /**
   * Reset the entire queue (for cleanup)
   */
  reset(): void {
    this.queue = [];
    this.activeUpload = null;
    this.processingQueue = false;
  }

  /**
   * Get detailed queue information for debugging
   */
  getQueueInfo() {
    return {
      queue: this.queue.map((upload) => ({
        itemId: upload.itemId,
        fileName: upload.fileName || upload.file.name,
        priority: upload.priority,
        addedAt: new Date(upload.addedAt).toISOString(),
      })),
      activeUpload: this.activeUpload
        ? {
            itemId: this.activeUpload.itemId,
            startedAt: new Date(this.activeUpload.startedAt).toISOString(),
            duration: Date.now() - this.activeUpload.startedAt,
          }
        : null,
      stats: this.getQueueStatus(),
    };
  }
}

export const uploadQueueManager = UploadQueueManager.getInstance();

// Expose globally for UI components
if (typeof window !== 'undefined') {
  window.__upload_queue_manager = uploadQueueManager;
}
