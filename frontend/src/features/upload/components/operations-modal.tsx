'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useDownloadList } from '@/features/dashboard/hooks/use-download';
import { HiOutlineXMark, HiOutlineChevronUp, HiOutlineChevronDown } from 'react-icons/hi2';
import { DuplicateDialog } from './duplicate-dialog';
import { OperationRow, type OperationType } from './operation-row';
import { QueueNotices } from './queue-notices';
import { useUploadExecutor } from '../context/upload-context';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';
import type { FileExtension } from '@/config/file-extensions';
import { useActiveUploadManager } from '@/hooks/use-auth';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';

interface OperationItem {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'mixed';
  detail?: string;
  operationType: OperationType;
  status: string;
  progress: number;
  size?: number;
  totalFiles?: number;
  completedFiles?: number;
  fileIds?: string[];
  parentFolderId?: string;
  isCalculatingSize?: boolean;
  error?: string;
  extension?: FileExtension;
  queuePosition?: number;
}

// Upload speed tracking for better time estimation
interface SpeedTracker {
  speeds: number[]; // bytes per second samples
  timestamps: number[];
  maxSamples: number;
}

const speedTracker: SpeedTracker = {
  speeds: [],
  timestamps: [],
  maxSamples: 10, // Keep last 10 speed samples
};

const trackUploadSpeed = (bytesUploaded: number, timeElapsed: number) => {
  if (timeElapsed > 0) {
    const speed = bytesUploaded / timeElapsed; // bytes per second
    const now = Date.now();

    speedTracker.speeds.push(speed);
    speedTracker.timestamps.push(now);

    // Keep only recent samples (last 30 seconds)
    const cutoffTime = now - 30000;
    const validIndices = speedTracker.timestamps
      .map((time, index) => (time > cutoffTime ? index : -1))
      .filter((index) => index !== -1);

    speedTracker.speeds = validIndices.map((i) => speedTracker.speeds[i]);
    speedTracker.timestamps = validIndices.map((i) => speedTracker.timestamps[i]);

    // Keep max samples limit
    if (speedTracker.speeds.length > speedTracker.maxSamples) {
      speedTracker.speeds = speedTracker.speeds.slice(-speedTracker.maxSamples);
      speedTracker.timestamps = speedTracker.timestamps.slice(-speedTracker.maxSamples);
    }
  }
};

const getAverageUploadSpeed = (): number => {
  if (speedTracker.speeds.length === 0) return 0;

  const totalSpeed = speedTracker.speeds.reduce((sum, speed) => sum + speed, 0);
  return totalSpeed / speedTracker.speeds.length;
};

type UploadsMap = ReturnType<typeof useUploadStore.getState>['uploads'];

/**
 * Hoisted out of the component: these are pure functions of the store data,
 * so redefining them on every render only created garbage and fresh identities
 * for no benefit.
 */

// Calculate folder progress based on its files
function getFolderProgress(uploads: UploadsMap, folderId: string): number {
  const folder = uploads[folderId];
  if (!folder || !folder.fileIds) return 0;

  const fileProgresses = folder.fileIds.map((id) => uploads[id]?.progress || 0);
  return fileProgresses.reduce((sum, progress) => sum + progress, 0) / fileProgresses.length;
}

// Calculate folder status based on its files
function getFolderStatus(uploads: UploadsMap, folderId: string): string {
  const folder = uploads[folderId];
  if (!folder || !folder.fileIds) return folder?.status || 'queued';

  const fileStatuses = folder.fileIds.map((id) => uploads[id]?.status).filter(Boolean);

  // If folder itself is cancelled, return cancelled
  if (folder.status === 'cancelled') return 'cancelled';

  // If any file is uploading, folder is uploading
  if (fileStatuses.some((status) => status === 'uploading')) return 'uploading';

  // If any file is paused, folder is paused
  if (fileStatuses.some((status) => status === 'paused')) return 'paused';

  // If all files are completed, folder is completed
  if (fileStatuses.length > 0 && fileStatuses.every((status) => status === 'completed'))
    return 'completed';

  // If some files are completed but others are not, folder is still uploading
  if (
    fileStatuses.some((status) => status === 'completed') &&
    fileStatuses.some((status) => ['uploading', 'queued', 'paused'].includes(status))
  ) {
    return 'uploading';
  }

  // If any file failed, folder has failed
  if (fileStatuses.some((status) => status === 'failed')) return 'failed';

  // Default to queued if all files are queued
  return 'queued';
}

// Extract file extension from filename
function getFileExtension(filename: string): FileExtension | undefined {
  const parts = filename.split('.');
  if (parts.length <= 1) return undefined;

  const ext = parts[parts.length - 1].toLowerCase();
  // Type assertion is safe here since we're checking against known extensions
  // If the extension is not in our FileExtension type, we'll return undefined
  return ext as FileExtension;
}

export const OperationsModal: React.FC = () => {
  // Field-level selectors, not `useUploadStore()`. Subscribing to the whole
  // store meant every batch update, every delete tick and every duplicate
  // prompt re-rendered this panel along with each of its rows.
  const uploads = useUploadStore((state) => state.uploads);
  const deletes = useUploadStore((state) => state.deletes);
  const removeUpload = useUploadStore((state) => state.removeUpload);
  const removeDeleteOperation = useUploadStore((state) => state.removeDeleteOperation);
  const updateUpload = useUploadStore((state) => state.updateUpload);
  const duplicateQueue = useUploadStore((state) => state.duplicateQueue);
  const resolveDuplicate = useUploadStore((state) => state.resolveDuplicate);
  const hideDuplicateDialog = useUploadStore((state) => state.hideDuplicateDialog);
  const resolveAllDuplicates = useUploadStore((state) => state.resolveAllDuplicates);
  const cancelAllDuplicates = useUploadStore((state) => state.cancelAllDuplicates);

  // Only the oldest pending duplicate is shown; answering it reveals the next.
  const currentDuplicate = duplicateQueue[0] ?? null;
  const { getAllDownloads, cancelDownload } = useDownloadList();
  const downloads = getAllDownloads();
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const uploadManager = useActiveUploadManager();
  const executor = useUploadExecutor();
  const uploadMode = useUploadSettingsStore((state) => state.uploadMode);
  // Only the count, so the panel re-renders when notices appear or disappear
  // but not when their contents change - QueueNotices owns that.
  const noticeCount = useUploadQueueStore((state) => state.notices.length);

  // Check if pause/resume is supported in current mode
  const supportsPauseResume = uploadMode === 'multipart';

  // Read inside the interval instead of depending on `uploads`, which changes
  // on every progress tick - the old dependency tore down and rebuilt the
  // interval each time, so under a steady stream of ticks the 3s timer could
  // never actually reach 3s.
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  // Simulate speed tracking for active uploads (demo purposes).
  // Must stay above the uploadManager guard below: hooks cannot sit after an
  // early return, or the hook count changes once the manager resolves.
  useEffect(() => {
    const interval = setInterval(() => {
      // Check if there are any uploading operations
      const hasActiveUploads = Object.values(uploadsRef.current).some(
        (upload) => upload.status === 'uploading'
      );

      if (hasActiveUploads) {
        // Simulate varying upload speeds (0.5MB/s to 2MB/s)
        const simulatedSpeed = (0.5 + Math.random() * 1.5) * 1024 * 1024;
        trackUploadSpeed(simulatedSpeed, 1);
      }
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Helper function to cancel operations (upload, delete, and download).
  // Stable across renders so the memoized rows are not invalidated by a fresh
  // closure on every tick.
  const cancelOperation = useCallback(
    (itemId: string, operationType: OperationType, isFolder = false) => {
      if (operationType === 'upload') {
        if (isFolder) {
          // A folder card's id IS the executor's task id, so cancelling goes
          // through the executor: it aborts every file, and - crucially -
          // decides whether the prefix claim can be handed back. Cancelling the
          // files directly would abort the uploads but leave the name reserved
          // for the rest of the session.
          if (executor && executor.uploadsFor(itemId).length > 0) {
            void executor.cancelTask(itemId);
          } else {
            // Folders queued before this session's executor existed, or
            // already settled. Fall back to the per-file path.
            const folder = useUploadStore.getState().uploads[itemId];
            folder?.fileIds?.forEach((fileId) => uploadManager?.cancelUpload(fileId));
          }
          // Through the store action rather than by assigning to
          // `folder.status`: that mutated zustand's state object in place,
          // so no subscriber was notified and the panel kept showing the
          // folder as active until some unrelated update forced a render.
          updateUpload(itemId, { status: 'cancelled', progress: 100 });
        } else {
          uploadManager?.cancelUpload(itemId);
        }
      } else if (operationType === 'delete') {
        // For delete operations, we need to cancel the delete operation
        // This depends on your delete implementation - you might need to add a cancel method
        // For now, we'll remove it from the store (assuming it can be cancelled)
        removeDeleteOperation(itemId);
      } else if (operationType === 'download') {
        // Cancel download operation
        cancelDownload(itemId);
      }
    },
    [executor, uploadManager, updateUpload, removeDeleteOperation, cancelDownload]
  );

  const removeOperation = useCallback(
    (itemId: string, operationType: OperationType) => {
      if (operationType === 'upload') {
        removeUpload(itemId);
      } else if (operationType === 'delete') {
        removeDeleteOperation(itemId);
      }
    },
    [removeUpload, removeDeleteOperation]
  );

  const pauseOperation = useCallback(
    (itemId: string) => uploadManager?.pauseUpload(itemId),
    [uploadManager]
  );

  const resumeOperation = useCallback(
    (itemId: string) => uploadManager?.resumeUpload(itemId),
    [uploadManager]
  );

  // Derivation lives above the `uploadManager` guard because useMemo is a
  // hook and hooks cannot follow an early return.
  const sortedOperations = useMemo(() => {
    // Combine and transform operations into unified format
    const allOperations: OperationItem[] = [
      // Upload operations
      ...Object.values(uploads)
        .filter((u) => u.type === 'folder' || (u.type === 'file' && !u.parentFolderId))
        .map((upload) => ({
          id: upload.id,
          name: upload.name,
          type: upload.type,
          operationType: 'upload' as const,
          status: upload.type === 'folder' ? getFolderStatus(uploads, upload.id) : upload.status,
          progress:
            upload.type === 'folder' ? getFolderProgress(uploads, upload.id) : upload.progress,
          fileIds: upload.fileIds,
          parentFolderId: upload.parentFolderId,
          extension: upload.type === 'file' ? getFileExtension(upload.name) : undefined,
        })),
      // Delete operations
      ...Object.values(deletes).map((deleteOp) => ({
        id: deleteOp.id,
        name: deleteOp.name,
        type: deleteOp.type,
        operationType: 'delete' as const,
        status: deleteOp.status,
        progress: deleteOp.progress,
        size: deleteOp.size,
        totalFiles: deleteOp.totalFiles,
        completedFiles: deleteOp.completedFiles,
        isCalculatingSize: deleteOp.isCalculatingSize,
        error: deleteOp.error,
        detail: deleteOp.detail,
        // The stored extension first. A batch card is named "8 items", which
        // has nothing to read an extension out of, but the hook already worked
        // out that all eight of them are .json.
        extension:
          deleteOp.type === 'file'
            ? ((deleteOp.extension as FileExtension | undefined) ?? getFileExtension(deleteOp.name))
            : undefined,
      })),
      // Download operations
      ...downloads.map((download) => ({
        id: download.fileId,
        name: download.fileName,
        type: 'file' as const,
        operationType: 'download' as const,
        status: download.status,
        progress: download.progress,
        error: download.error,
        queuePosition: download.queuePosition,
        extension: getFileExtension(download.fileName),
      })),
    ];

    // Sort operations to prioritize active ones (uploading, deleting, downloading, queued) at the top
    return allOperations.sort((a, b) => {
      const getStatusPriority = (status: string) => {
        switch (status) {
          case 'uploading':
          case 'deleting':
          case 'downloading':
            return 1; // Highest priority (actively processing)
          case 'pending':
            return 1.5; // Just started
          case 'queued':
            return 2; // Second priority (waiting to be processed)
          case 'completed':
            return 3; // Third priority (finished successfully)
          case 'cancelled':
            return 4; // Fourth priority (user cancelled)
          case 'failed':
          case 'error':
            return 5; // Lowest priority (failed operations)
          default:
            return 6; // Unknown status
        }
      };

      const aPriority = getStatusPriority(a.status);
      const bPriority = getStatusPriority(b.status);

      // If priorities are different, sort by priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // If both are queued downloads, sort by queue position
      if (a.status === 'queued' && b.status === 'queued') {
        if (a.queuePosition && b.queuePosition) {
          return a.queuePosition - b.queuePosition;
        }
      }

      // If priorities are the same, maintain original order (stable sort)
      // This means newer operations with the same status will appear after older ones
      return 0;
    });
  }, [uploads, deletes, downloads]);

  if (!uploadManager) {
    return 'Loading...';
  }

  // If no operations, no duplicate dialog and nothing to report, don't show
  // modal. Notices count: a drop where every folder was skipped starts no
  // uploads at all, and hiding the panel would leave the user with no
  // indication that anything happened.
  if (sortedOperations.length === 0 && !currentDuplicate && noticeCount === 0) {
    return null;
  }

  // Count different types of operations
  const activeUploads = sortedOperations.filter(
    (op) => op.operationType === 'upload' && ['uploading', 'queued'].includes(op.status)
  ).length;

  const activeDeletes = sortedOperations.filter(
    (op) => op.operationType === 'delete' && ['deleting', 'queued'].includes(op.status)
  ).length;

  const activeDownloads = sortedOperations.filter(
    (op) =>
      op.operationType === 'download' && ['downloading', 'pending', 'queued'].includes(op.status)
  ).length;

  const completedOps = sortedOperations.filter((op) => op.status === 'completed').length;
  const cancelledOps = sortedOperations.filter((op) => op.status === 'cancelled').length;

  const completedUploads = sortedOperations.filter(
    (op) => op.operationType === 'upload' && op.status === 'completed'
  ).length;

  const completedDeletes = sortedOperations.filter(
    (op) => op.operationType === 'delete' && op.status === 'completed'
  ).length;

  const completedDownloads = sortedOperations.filter(
    (op) => op.operationType === 'download' && op.status === 'completed'
  ).length;

  // Get title based on operations
  const getTitle = () => {
    // If only duplicate dialog is open, show appropriate title
    if (sortedOperations.length === 0 && currentDuplicate) {
      return 'File Upload';
    }

    const hasActiveOperations = activeUploads > 0 || activeDeletes > 0 || activeDownloads > 0;
    const totalActive = activeUploads + activeDeletes + activeDownloads;

    if (hasActiveOperations) {
      // Show active operations
      if (totalActive > 1) {
        return `${totalActive} operations in progress`;
      } else if (activeUploads > 0) {
        return `Uploading ${activeUploads} item${activeUploads > 1 ? 's' : ''}`;
      } else if (activeDeletes > 0) {
        return `Deleting ${activeDeletes} item${activeDeletes > 1 ? 's' : ''}`;
      } else if (activeDownloads > 0) {
        return `Downloading ${activeDownloads} file${activeDownloads > 1 ? 's' : ''}`;
      }
    }

    // Show completed/cancelled operations when no active ones
    if (cancelledOps > 0 && completedOps === 0) {
      return `${cancelledOps} operation${cancelledOps > 1 ? 's' : ''} cancelled`;
    }

    if (completedOps > 0 && cancelledOps === 0) {
      const completedCount =
        (completedUploads > 0 ? 1 : 0) +
        (completedDeletes > 0 ? 1 : 0) +
        (completedDownloads > 0 ? 1 : 0);

      if (completedCount > 1) {
        return `Operations complete`;
      } else if (completedUploads > 0) {
        return `Upload complete`;
      } else if (completedDeletes > 0) {
        return `Delete complete`;
      } else if (completedDownloads > 0) {
        return `Download complete`;
      }
    }

    if (completedOps > 0 && cancelledOps > 0) {
      return `${completedOps} complete, ${cancelledOps} cancelled`;
    }

    return `${sortedOperations.length} operation${sortedOperations.length > 1 ? 's' : ''}`;
  };

  // Enhanced time estimation with size-awareness and speed tracking
  const getEnhancedTimeEstimate = (operations: OperationItem[]) => {
    const uploadOps = operations.filter((op) => op.operationType === 'upload');
    if (uploadOps.length === 0) return null;

    // Calculate total bytes and completed bytes
    let totalBytes = 0;
    let completedBytes = 0;
    let hasFileSizes = false;

    uploadOps.forEach((op) => {
      if (op.size && op.size > 0) {
        hasFileSizes = true;
        totalBytes += op.size;
        completedBytes += (op.size * op.progress) / 100;
      }
    });

    // If we don't have file sizes, fall back to simple progress-based estimation
    if (!hasFileSizes) {
      const totalProgress = uploadOps.reduce((sum, op) => sum + op.progress, 0);
      const avgProgress = Math.round(totalProgress / uploadOps.length);
      if (avgProgress > 0) {
        const remainingProgress = (100 - avgProgress) * uploadOps.length;
        const estimatedMinutes = Math.max(1, Math.round(remainingProgress / 15)); // Slightly faster than before
        return estimatedMinutes;
      }
      return null;
    }

    const remainingBytes = totalBytes - completedBytes;
    if (remainingBytes <= 0) return 0;

    // Get current upload speed
    const avgSpeed = getAverageUploadSpeed();

    // If we don't have speed data yet, estimate based on typical speeds
    if (avgSpeed === 0) {
      // Assume reasonable upload speed based on file types and connection
      const estimatedSpeed = 1024 * 1024; // 1 MB/s as baseline
      const estimatedSeconds = remainingBytes / estimatedSpeed;

      // Account for concurrency (max 2 uploads)
      const maxConcurrency = 2;
      const activeUploads = uploadOps.filter((op) => op.status === 'uploading').length;
      const concurrencyFactor =
        Math.min(maxConcurrency, uploadOps.length) / Math.max(1, activeUploads);

      return Math.max(1, Math.ceil((estimatedSeconds * concurrencyFactor) / 60));
    }

    // Use actual speed data
    const estimatedSeconds = remainingBytes / avgSpeed;

    // Account for queue and concurrency
    const maxConcurrency = 2;
    const activeCount = uploadOps.filter((op) => op.status === 'uploading').length;
    const queuedCount = uploadOps.filter((op) => op.status === 'queued').length;

    // If we have queued items, add estimated queue time
    let queueTime = 0;
    if (queuedCount > 0 && activeCount < maxConcurrency) {
      const availableSlots = maxConcurrency - activeCount;
      const avgFileTime = estimatedSeconds / Math.max(1, activeCount);
      queueTime = (queuedCount / availableSlots) * avgFileTime;
    }

    const totalEstimatedSeconds = estimatedSeconds + queueTime;
    return Math.max(1, Math.ceil(totalEstimatedSeconds / 60));
  };

  // Get subtitle based on active operations
  const getSubtitle = () => {
    const totalActiveOps = activeUploads + activeDeletes + activeDownloads;

    if (totalActiveOps > 0) {
      // Separate actively processing and queued items
      const processingItems = sortedOperations.filter((op) =>
        ['uploading', 'deleting', 'downloading', 'pending'].includes(op.status)
      );
      const queuedItems = sortedOperations.filter((op) => op.status === 'queued');

      // If we have items actually processing, show enhanced time estimate
      if (processingItems.length > 0) {
        const estimatedMinutes = getEnhancedTimeEstimate(sortedOperations);

        if (estimatedMinutes !== null && estimatedMinutes > 0) {
          // Show more granular time for short durations
          if (estimatedMinutes < 2) {
            const estimatedSeconds = estimatedMinutes * 60;
            if (estimatedSeconds < 60) {
              return `${Math.max(30, estimatedSeconds)} sec left...`;
            }
            return `1 min left...`;
          }

          // Show queue information if relevant
          const queuedCount = queuedItems.length;
          if (queuedCount > 0) {
            return `${estimatedMinutes} min total, ${queuedCount} queued`;
          }

          return `${estimatedMinutes} min left...`;
        } else {
          // Still calculating speed/gathering data
          return 'Calculating time...';
        }
      }

      // If all items are queued or just started processing (0% progress)
      if (
        queuedItems.length === totalActiveOps ||
        processingItems.every((item) => item.progress === 0)
      ) {
        if (
          (activeUploads > 0 ? 1 : 0) +
            (activeDeletes > 0 ? 1 : 0) +
            (activeDownloads > 0 ? 1 : 0) >
          1
        ) {
          return 'Starting operations...';
        } else if (activeUploads > 0) {
          return 'Starting uploads...';
        } else if (activeDeletes > 0) {
          return 'Starting deletes...';
        } else if (activeDownloads > 0) {
          return `${queuedItems.length > 0 ? `${queuedItems.length} in queue` : 'Starting downloads...'}`;
        }
      }

      // Fallback for mixed states
      const activeTypesCount =
        (activeUploads > 0 ? 1 : 0) + (activeDeletes > 0 ? 1 : 0) + (activeDownloads > 0 ? 1 : 0);
      if (activeTypesCount > 1) {
        return 'Processing...';
      } else if (activeUploads > 0) {
        return 'Uploading...';
      } else if (activeDeletes > 0) {
        return 'Deleting...';
      } else if (activeDownloads > 0) {
        return `Downloading${queuedItems.length > 0 ? ` (${queuedItems.length} queued)` : '...'}`;
      }
    }
    return null;
  };

  return (
    <>
      {/* Operations Modal - All Screen Sizes */}
      <div>
        <div
          className="fixed z-50 transition-all duration-300 ease-in-out bottom-4
            w-[calc(100vw-2rem)] max-w-sm left-1/2 -translate-x-1/2
            sm:w-80 sm:max-w-none sm:right-4 sm:left-auto sm:translate-x-0"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          }}
        >
          {/* Header  */}
          <div
            className="flex items-center justify-between px-4 py-3 "
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {getTitle()}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 sm:p-1 rounded transition-colors duration-200"
                style={{
                  color: 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {isExpanded ? (
                  <HiOutlineChevronDown className="w-5 h-5 sm:w-4 sm:h-4" />
                ) : (
                  <HiOutlineChevronUp className="w-5 h-5 sm:w-4 sm:h-4" />
                )}
              </button>
              <button
                onClick={() => {
                  const hasActiveOperations = sortedOperations.some((op) =>
                    ['uploading', 'queued', 'deleting'].includes(op.status)
                  );
                  if (hasActiveOperations) {
                    setShowCancelDialog(true);
                  } else {
                    // Close the modal by removing all operations
                    sortedOperations.forEach((op) => {
                      if (op.operationType === 'upload') {
                        removeUpload(op.id);
                      } else if (op.operationType === 'delete') {
                        removeDeleteOperation(op.id);
                      }
                    });
                  }
                }}
                className="p-2 sm:p-1 rounded transition-colors duration-200"
                style={{
                  color: 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <HiOutlineXMark className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {/* Subtitle */}
          {getSubtitle() && isExpanded && (
            <div
              className="px-4 py-2 flex items-center justify-between"
              style={{ background: 'var(--secondary)' }}
            >
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {getSubtitle()}
              </p>
              <button
                className="text-xs font-medium"
                style={{ color: 'var(--primary)' }}
                onClick={() => {
                  // Cancel all active operations (uploads and deletes)
                  sortedOperations
                    .filter((op) => ['uploading', 'queued', 'deleting'].includes(op.status))
                    .forEach((op) =>
                      cancelOperation(op.id, op.operationType, op.type === 'folder')
                    );
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* What the drop could not do quietly: renames, skipped files, and
              folders we could not verify against the bucket. Subscribes to the
              queue store, which no progress tick touches. */}
          {isExpanded && <QueueNotices />}

          {/* Operations List */}
          {isExpanded && sortedOperations.length > 0 && (
            <div className="max-h-60 sm:max-h-96 overflow-y-auto custom-scrollbar">
              {sortedOperations.map((operation) => (
                <OperationRow
                  key={operation.id}
                  id={operation.id}
                  name={operation.name}
                  type={operation.type}
                  detail={operation.detail}
                  operationType={operation.operationType}
                  status={operation.status}
                  progress={operation.progress}
                  extension={operation.extension}
                  error={operation.error}
                  queuePosition={operation.queuePosition}
                  totalFiles={operation.totalFiles}
                  completedFiles={operation.completedFiles}
                  isHovered={hoveredItem === operation.id}
                  supportsPauseResume={supportsPauseResume}
                  onHoverChange={setHoveredItem}
                  onCancel={cancelOperation}
                  onRemove={removeOperation}
                  onPause={pauseOperation}
                  onResume={resumeOperation}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setShowCancelDialog(false)}
          />
          <div
            className="relative rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
                  Cancel all operations?
                </h2>
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="p-1 rounded transition-colors duration-200"
                  style={{ color: 'var(--muted-foreground)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <HiOutlineXMark className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
                Your operations are not complete. Would you like to cancel all ongoing operations?
              </p>
            </div>

            <div
              className="px-6 py-4 flex justify-end gap-3"
              style={{ background: 'var(--secondary)' }}
            >
              <button
                onClick={() => {
                  // Cancel all active operations
                  sortedOperations
                    .filter((op) => ['uploading', 'queued', 'deleting'].includes(op.status))
                    .forEach((op) =>
                      cancelOperation(op.id, op.operationType, op.type === 'folder')
                    );
                  setShowCancelDialog(false);
                }}
                className="px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200"
                style={{
                  color: 'var(--muted-foreground)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Cancel all
              </button>
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-6 py-2 text-sm font-medium rounded-md transition-colors duration-200"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Dialog */}
      <DuplicateDialog
        isOpen={currentDuplicate !== null}
        onClose={hideDuplicateDialog}
        duplicateItem={currentDuplicate?.duplicateItem ?? null}
        onReplace={() => resolveDuplicate('replace')}
        onKeepBoth={() => resolveDuplicate('keepBoth')}
        pendingCount={duplicateQueue.length}
        onApplyToAll={(choice) =>
          resolveAllDuplicates(choice === 'replace' ? 'replace' : 'keepBoth')
        }
        onCancelAll={cancelAllDuplicates}
      />
    </>
  );
};
