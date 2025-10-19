'use client';

import React, { useState } from 'react';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useDownload } from '@/features/dashboard/hooks/use-download';
import { HiOutlineXMark, HiOutlineChevronUp, HiOutlineChevronDown } from 'react-icons/hi2';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { FolderIcon } from '@/shared/components/icons/folder-icons';
import { DuplicateDialog } from './duplicate-dialog';
import type { FileExtension } from '@/config/file-extensions';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useActiveUploadManager } from '@/hooks/use-auth';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';

interface OperationItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  operationType: 'upload' | 'delete' | 'download';
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

export const OperationsModal: React.FC = () => {
  const {
    uploads,
    deletes,
    removeUpload,
    removeDeleteOperation,
    duplicateDialog,
    hideDuplicateDialog,
  } = useUploadStore();
  const { getAllDownloads, cancelDownload } = useDownload();
  const downloads = getAllDownloads();
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const uploadManager = useActiveUploadManager();
  const { uploadMode } = useUploadSettingsStore();

  // Check if pause/resume is supported in current mode
  const supportsPauseResume = uploadMode === 'multipart';

  if (!uploadManager) {
    return 'Loading...';
  }

  // Simulate speed tracking for active uploads (demo purposes) - moved to top to fix hook order
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Check if there are any uploading operations
      const hasActiveUploads = Object.values(uploads).some(
        (upload) => upload.status === 'uploading'
      );

      if (hasActiveUploads) {
        // Simulate varying upload speeds (0.5MB/s to 2MB/s)
        const simulatedSpeed = (0.5 + Math.random() * 1.5) * 1024 * 1024;
        trackUploadSpeed(simulatedSpeed, 1);
      }
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, [uploads]); // Depend on uploads object

  // Helper function to cancel operations (upload, delete, and download)
  const cancelOperation = (
    itemId: string,
    operationType: 'upload' | 'delete' | 'download',
    isFolder = false
  ) => {
    if (operationType === 'upload') {
      if (isFolder) {
        const folder = uploads[itemId];
        if (folder && folder.fileIds) {
          // Cancel all individual files in the folder
          folder.fileIds.forEach((fileId) => {
            uploadManager.cancelUpload(fileId);
          });
          folder.status = 'cancelled';
          folder.progress = 100;
          // The folder status will be updated by the upload manager
        }
      } else {
        uploadManager.cancelUpload(itemId);
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
  };

  // Calculate folder progress based on its files
  const getFolderProgress = (folderId: string): number => {
    const folder = uploads[folderId];
    if (!folder || !folder.fileIds) return 0;

    const fileProgresses = folder.fileIds.map((id) => uploads[id]?.progress || 0);
    return fileProgresses.reduce((sum, progress) => sum + progress, 0) / fileProgresses.length;
  };

  // Calculate folder status based on its files
  const getFolderStatus = (folderId: string): string => {
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
  };

  // Extract file extension from filename
  const getFileExtension = (filename: string): FileExtension | undefined => {
    const parts = filename.split('.');
    if (parts.length <= 1) return undefined;

    const ext = parts[parts.length - 1].toLowerCase();
    // Type assertion is safe here since we're checking against known extensions
    // If the extension is not in our FileExtension type, we'll return undefined
    return ext as FileExtension;
  };

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
        status: upload.type === 'folder' ? getFolderStatus(upload.id) : upload.status,
        progress: upload.type === 'folder' ? getFolderProgress(upload.id) : upload.progress,
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
      extension: deleteOp.type === 'file' ? getFileExtension(deleteOp.name) : undefined,
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
  const sortedOperations = allOperations.sort((a, b) => {
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

  // If no operations and no duplicate dialog, don't show modal
  if (sortedOperations.length === 0 && !duplicateDialog.isOpen) {
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
    if (sortedOperations.length === 0 && duplicateDialog.isOpen) {
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

          {/* Operations List */}
          {isExpanded && sortedOperations.length > 0 && (
            <div className="max-h-60 sm:max-h-96 overflow-y-auto custom-scrollbar">
              {sortedOperations.map((operation) => {
                const canCancel = [
                  'uploading',
                  'queued',
                  'deleting',
                  'paused',
                  'downloading',
                  'pending',
                ].includes(operation.status);
                const isActive = [
                  'uploading',
                  'queued',
                  'deleting',
                  'downloading',
                  'pending',
                ].includes(operation.status);

                return (
                  <div
                    key={operation.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-opacity-50 transition-colors duration-200"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (canCancel) {
                        e.currentTarget.style.background = 'var(--secondary)';
                        setHoveredItem(operation.id);
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      setHoveredItem(null);
                    }}
                  >
                    {/* File/Folder Icon */}
                    <div className="flex-shrink-0">
                      {operation.type === 'folder' ? (
                        <FolderIcon />
                      ) : (
                        <FileIcon
                          extension={operation.extension}
                          filename={operation.name}
                          className="w-6 h-6"
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium truncate"
                        title={operation.name}
                        style={{ color: 'var(--foreground)' }}
                      >
                        {operation.name}
                      </p>
                      {operation.status === 'completed' && (
                        <p
                          className="text-xs"
                          style={{
                            color:
                              operation.operationType === 'upload'
                                ? 'var(--muted-foreground)'
                                : operation.operationType === 'download'
                                  ? 'var(--muted-foreground)'
                                  : '#ef4444',
                          }}
                        >
                          {operation.operationType === 'upload'
                            ? 'Upload complete'
                            : operation.operationType === 'delete'
                              ? 'Delete complete'
                              : 'Download complete'}
                        </p>
                      )}
                      {operation.status === 'cancelled' && (
                        <p className="text-xs" style={{ color: '#ef4444' }}>
                          {operation.operationType === 'upload'
                            ? 'Upload cancelled'
                            : operation.operationType === 'delete'
                              ? 'Delete cancelled'
                              : 'Download cancelled'}
                        </p>
                      )}
                      {operation.status === 'uploading' && (
                        <p className="text-xs" style={{ color: 'var(--primary)' }}>
                          Uploading...
                        </p>
                      )}
                      {operation.status === 'downloading' && (
                        <p className="text-xs" style={{ color: 'var(--primary)' }}>
                          Downloading...
                        </p>
                      )}
                      {operation.status === 'pending' && (
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          Starting...
                        </p>
                      )}
                      {operation.status === 'queued' && (
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {operation.queuePosition
                            ? `In queue (${operation.queuePosition})`
                            : 'Queued'}
                        </p>
                      )}
                      {operation.status === 'paused' && (
                        <p className="text-xs" style={{ color: '#f59e0b' }}>
                          Paused
                        </p>
                      )}
                      {operation.status === 'error' && (
                        <p className="text-xs" style={{ color: '#ef4444' }}>
                          {operation.error || 'Failed'}
                        </p>
                      )}
                      {operation.totalFiles && operation.completedFiles !== undefined && (
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {operation.completedFiles} of {operation.totalFiles}
                        </p>
                      )}
                    </div>

                    {/* Pause/Resume Buttons and Progress Circle */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {/* Pause/Resume Buttons for file uploads only - only in multipart mode */}
                      {supportsPauseResume &&
                        operation.operationType === 'upload' &&
                        operation.type === 'file' &&
                        (isActive || operation.status === 'paused') && (
                          <div className="flex items-center">
                            {/* Pause Button - always visible on mobile, hover-based on desktop */}
                            {operation.status === 'uploading' &&
                              operation.operationType === 'upload' &&
                              operation.type === 'file' && (
                                <AriaLabel
                                  label={`Pause upload of ${operation.name}`}
                                  position="top"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      uploadManager.pauseUpload(operation.id);
                                    }}
                                    className={`w-7 h-7 rounded transition-colors duration-200 flex items-center justify-center ${
                                      hoveredItem === operation.id ? 'flex' : 'flex sm:hidden'
                                    }`}
                                    style={{
                                      color: 'var(--muted-foreground)',
                                      background: 'var(--accent)',
                                      border: '1px solid var(--border)',
                                    }}
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </button>
                                </AriaLabel>
                              )}

                            {/* Resume Button - for paused files, near the progress circle */}
                            {operation.status === 'paused' &&
                              operation.operationType === 'upload' &&
                              operation.type === 'file' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    uploadManager.resumeUpload(operation.id);
                                  }}
                                  className="w-7 h-7 rounded transition-colors duration-200 flex items-center justify-center"
                                  style={{
                                    color: 'var(--muted-foreground)',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--accent)';
                                    e.currentTarget.style.border = '1px solid var(--border)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.border = 'none';
                                  }}
                                  title="Resume Upload"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </button>
                              )}
                          </div>
                        )}

                      {/* Progress Circle */}
                      <div className="relative">
                        {isActive || operation.status === 'paused' ? (
                          <div className="relative w-6 h-6">
                            {/* Progress Circle Background */}
                            <svg className="w-6 h-6 transform -rotate-90" viewBox="0 0 24 24">
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                fill="none"
                                stroke="var(--progress-track)"
                                strokeWidth="2"
                              />
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                fill="none"
                                stroke={
                                  operation.operationType === 'delete'
                                    ? '#ef4444'
                                    : operation.operationType === 'download'
                                      ? '#3b82f6'
                                      : 'var(--primary)'
                                }
                                strokeWidth="2"
                                strokeDasharray={`${2 * Math.PI * 10}`}
                                strokeDashoffset={`${2 * Math.PI * 10 * (1 - operation.progress / 100)}`}
                                strokeLinecap="round"
                                className="transition-all duration-300"
                              />
                            </svg>

                            {/* Cancel Button on Hover for Paused Files */}
                            {operation.status === 'paused' &&
                              operation.operationType === 'upload' &&
                              operation.type === 'file' &&
                              hoveredItem === operation.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelOperation(
                                      operation.id,
                                      operation.operationType,
                                      operation.type === 'folder'
                                    );
                                  }}
                                  className="absolute inset-0 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                                  style={{
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                  }}
                                  title="Cancel"
                                >
                                  <HiOutlineXMark
                                    className="w-3 h-3"
                                    style={{ color: 'var(--muted-foreground)' }}
                                  />
                                </button>
                              )}

                            {/* Cancel Button on Hover for non-paused active operations */}
                            {hoveredItem === operation.id &&
                              canCancel &&
                              operation.status !== 'paused' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelOperation(
                                      operation.id,
                                      operation.operationType,
                                      operation.type === 'folder'
                                    );
                                  }}
                                  className="absolute inset-0 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                                  style={{
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  <HiOutlineXMark
                                    className="w-3 h-3"
                                    style={{ color: 'var(--muted-foreground)' }}
                                  />
                                </button>
                              )}
                          </div>
                        ) : operation.status === 'completed' ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 flex items-center justify-center">
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ background: '#22c55e' }}
                              >
                                <svg className="w-2.5 h-2.5" fill="white" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                // Remove completed item from list
                                if (operation.operationType === 'upload') {
                                  removeUpload(operation.id);
                                } else if (operation.operationType === 'delete') {
                                  removeDeleteOperation(operation.id);
                                }
                              }}
                              className="p-1 rounded transition-colors duration-200"
                              style={{ color: 'var(--muted-foreground)' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--accent)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <HiOutlineXMark className="w-3 h-3" />
                            </button>
                          </div>
                        ) : operation.status === 'cancelled' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                // Remove cancelled item from list
                                if (operation.operationType === 'upload') {
                                  removeUpload(operation.id);
                                } else if (operation.operationType === 'delete') {
                                  removeDeleteOperation(operation.id);
                                }
                              }}
                              className="p-1 rounded transition-colors duration-200"
                              style={{ color: 'var(--muted-foreground)' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--accent)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                              }}
                              title="Remove from list"
                            >
                              <HiOutlineXMark className="w-3 h-3" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
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
        isOpen={duplicateDialog.isOpen}
        onClose={hideDuplicateDialog}
        duplicateItem={duplicateDialog.duplicateItem}
        onReplace={duplicateDialog.onReplace || (() => {})}
        onKeepBoth={duplicateDialog.onKeepBoth || (() => {})}
      />
    </>
  );
};
