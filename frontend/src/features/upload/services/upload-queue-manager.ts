'use client';

import { MultipartUploader } from '@opndrive/s3-api';

/**
 * Sequential Upload Queue Manager
 * Handles ONE upload at a time to prevent concurrency issues
 */

export interface QueuedUpload {
  itemId: string;
  file: File;
  fileName?: string; // For renamed files (keep both scenario)
  priority: number; // Higher number = higher priority
  addedAt: number;
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
    console.log(
      `[QUEUE_DEBUG] Added ${queuedUpload.itemId} to queue. Queue length: ${this.queue.length}`
    );
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
      console.log(`[QUEUE_DEBUG] Cleared active upload ${itemId}`);
    }

    console.log(`[QUEUE_DEBUG] Removed ${itemId} from queue. Queue length: ${this.queue.length}`);
    this.processQueue();
  }

  /**
   * Pause an active upload
   */
  pauseUpload(itemId: string): void {
    if (this.activeUpload?.itemId === itemId) {
      // The uploader itself handles the pause, just clear from active
      this.activeUpload = null;
      console.log(
        `[QUEUE_DEBUG] Paused active upload ${itemId} - slot freed, processing next in queue`
      );
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
      console.log(`[QUEUE_DEBUG] Upload ${itemId} is already active, ignoring resume`);
      return;
    }

    if (this.queue.some((upload) => upload.itemId === itemId)) {
      console.log(`[QUEUE_DEBUG] Upload ${itemId} is already queued, ignoring resume`);
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
    console.log(`[QUEUE_DEBUG] Added resumed upload ${itemId} to front of queue`);
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
    console.log(
      `[QUEUE_DEBUG] processQueue called - processing: ${this.processingQueue}, active: ${this.activeUpload?.itemId}, queue length: ${this.queue.length}`
    );

    if (this.processingQueue || this.activeUpload !== null) {
      console.log(
        `[QUEUE_DEBUG] Cannot process queue - processing: ${this.processingQueue}, active: ${this.activeUpload?.itemId}`
      );
      return;
    }

    this.processingQueue = true;

    try {
      if (this.queue.length > 0) {
        // Sort queue by priority (highest first)
        this.queue.sort((a, b) => b.priority - a.priority);

        const nextUpload = this.queue.shift();
        if (nextUpload) {
          console.log(
            `[QUEUE_DEBUG] Starting next upload: ${nextUpload.itemId} (queue remaining: ${this.queue.length})`
          );
          await this.startUpload(nextUpload);
        }
      } else {
        console.log(`[QUEUE_DEBUG] Queue is empty - no more uploads to process`);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Start an individual upload
   */
  private async startUpload(queuedUpload: QueuedUpload): Promise<void> {
    const { itemId, file, fileName } = queuedUpload;

    // Mark as active
    this.activeUpload = {
      itemId,
      startedAt: Date.now(),
      uploader: null, // Will be set by the upload handler
    };

    console.log(`[QUEUE_DEBUG] Set active upload to ${itemId}`);

    // Dispatch event to trigger actual upload
    const event = new CustomEvent('startQueuedUpload', {
      detail: { itemId, file, fileName },
    });
    window.dispatchEvent(event);
  }

  /**
   * Update active upload with uploader instance
   */
  setUploaderInstance(itemId: string, uploader: MultipartUploader | null): void {
    if (this.activeUpload?.itemId === itemId) {
      this.activeUpload.uploader = uploader;
      console.log(`[QUEUE_DEBUG] Set uploader instance for active upload ${itemId}`);
    }
  }

  /**
   * Reset the entire queue (for cleanup)
   */
  reset(): void {
    this.queue = [];
    this.activeUpload = null;
    this.processingQueue = false;
    console.log(`[QUEUE_DEBUG] Reset queue manager`);
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
