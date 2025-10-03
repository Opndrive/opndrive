'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle,
  AlertCircle,
  XCircle,
  Pause,
  Upload,
  ChevronDown,
  ChevronUp,
  Minus,
} from 'lucide-react';
import { useUploadStore } from '../hooks/use-upload-store';
import { UploadItemComponent } from './upload-item';
import { DuplicateDialog } from './duplicate-dialog';
import { AriaLabel } from '@/shared/components';

export function UploadCard() {
  const {
    isOpen,
    isMinimized,
    items,
    totalItems,
    completedItems,
    isUploading: _isUploading,
    duplicateDialog,
    closeCard: _closeCard,
    forceCloseCard,
    minimizeCard,
    maximizeCard,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    removeItem,
    clearCompleted,
    hideDuplicateDialog,
    forceRefresh,
  } = useUploadStore();

  // Force re-render every 2 seconds when there are active uploads to update queue status
  const [, setRenderTrigger] = useState(0);

  useEffect(() => {
    const hasActiveUploads = items.some(
      (item) => item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
    );

    if (hasActiveUploads) {
      const interval = setInterval(() => {
        setRenderTrigger((prev) => prev + 1);
        forceRefresh();
      }, 2000); // Update every 2 seconds

      return () => clearInterval(interval);
    }
  }, [items, forceRefresh]);

  // Hide card when not open or when there are no items
  if (!isOpen || items.length === 0) {
    return null;
  }

  const handleCloseCard = () => {
    // Always close the card when X is clicked - force close even during uploads
    // If there are completed items, clear them first, then close
    const hasActiveUploads = items.some(
      (item) => item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
    );

    if (!hasActiveUploads) {
      clearCompleted();
    }
    forceCloseCard();
  };

  const getHeaderInfo = () => {
    if (totalItems === 0)
      return { text: 'No operations', colorStyle: { color: 'var(--muted-foreground)' } };

    const activeItems = items.filter(
      (item) => item.status === 'uploading' || item.status === 'pending'
    );

    const actuallyCompleted = items.filter((item) => item.status === 'completed').length;
    const cancelledItems = items.filter((item) => item.status === 'cancelled').length;
    const errorItems = items.filter((item) => item.status === 'error').length;
    const pausedItems = items.filter((item) => item.status === 'paused').length;

    // Handle active operations
    if (activeItems.length > 0) {
      const activeUploads = activeItems.filter((item) => item.operation === 'upload');
      const activeDeletes = activeItems.filter((item) => item.operation === 'delete');
      const activeOthers = activeItems.filter(
        (item) => !['upload', 'delete'].includes(item.operation)
      );

      let actuallyUploading = items.filter((item) => item.status === 'uploading').length;
      let actuallyQueued = 0;

      // Check queue manager for accurate status
      if (typeof window !== 'undefined' && window.__upload_queue_manager) {
        const queueManager = window.__upload_queue_manager;

        // Count items that are actually uploading (active in queue manager)
        items.forEach((item) => {
          if (item.status === 'pending') {
            if (queueManager.isUploadActive(item.id) && item.progress > 0) {
              actuallyUploading++;
            } else {
              actuallyQueued++;
            }
          }
        });
      } else {
        // Fallback: count pending as queued
        actuallyQueued = items.filter((item) => item.status === 'pending').length;
      }

      // Mixed operations active
      if (activeUploads.length > 0 && activeDeletes.length > 0) {
        return {
          text: `${activeUploads.length} uploading, ${activeDeletes.length} deleting`,
          colorStyle: { color: 'var(--primary)' },
          icon: Upload,
        };
      }

      // Only uploads active
      if (activeUploads.length > 0 && activeDeletes.length === 0) {
        if (actuallyQueued > 0) {
          return {
            text: `Uploading ${actuallyUploading} file${actuallyUploading === 1 ? '' : 's'} (${actuallyQueued} queued)`,
            colorStyle: { color: 'var(--primary)' },
            icon: Upload,
          };
        } else {
          return {
            text: `Uploading ${actuallyUploading} file${actuallyUploading === 1 ? '' : 's'}`,
            colorStyle: { color: 'var(--primary)' },
            icon: Upload,
          };
        }
      }

      // Only deletes active
      if (activeDeletes.length > 0 && activeUploads.length === 0) {
        return {
          text: `Deleting ${activeDeletes.length} item${activeDeletes.length === 1 ? '' : 's'}`,
          colorStyle: { color: '#dc2626' }, // red-600
          icon: Minus,
        };
      }

      // Other operations
      if (activeOthers.length > 0) {
        return {
          text: `Processing ${activeOthers.length} item${activeOthers.length === 1 ? '' : 's'}`,
          colorStyle: { color: 'var(--primary)' },
          icon: Upload,
        };
      }
    }

    // Handle paused operations
    if (pausedItems > 0) {
      return {
        text: `${pausedItems} operation${pausedItems === 1 ? '' : 's'} paused`,
        colorStyle: { color: '#d97706' }, // orange-600
        icon: Pause,
      };
    }

    // Handle finished operations with mixed results
    if (actuallyCompleted > 0 && (cancelledItems > 0 || errorItems > 0)) {
      const failedCount = cancelledItems + errorItems;
      return {
        text: `${actuallyCompleted} completed, ${failedCount} failed`,
        colorStyle: { color: '#d97706' }, // orange-600
        icon: AlertCircle,
      };
    }

    // Handle only completed
    if (actuallyCompleted > 0) {
      const completedUploads = items.filter(
        (item) => item.status === 'completed' && item.operation === 'upload'
      ).length;
      const completedDeletes = items.filter(
        (item) => item.status === 'completed' && item.operation === 'delete'
      ).length;

      if (completedUploads > 0 && completedDeletes > 0) {
        return {
          text: `${completedUploads} uploaded, ${completedDeletes} deleted`,
          colorStyle: { color: '#d97706' }, // orange-600 for mixed operations
          icon: CheckCircle,
        };
      } else if (completedDeletes > 0) {
        return {
          text: `${completedDeletes} item${completedDeletes === 1 ? '' : 's'} deleted`,
          colorStyle: { color: '#dc2626' }, // red-600 for deletes
          icon: Minus,
        };
      } else {
        return {
          text: `${actuallyCompleted} upload${actuallyCompleted === 1 ? '' : 's'} completed`,
          colorStyle: { color: '#16a34a' }, // green-600
          icon: CheckCircle,
        };
      }
    }

    // Handle only cancelled
    if (cancelledItems > 0) {
      return {
        text: `${cancelledItems} operation${cancelledItems === 1 ? '' : 's'} cancelled`,
        colorStyle: { color: '#dc2626' }, // red-600
        icon: XCircle,
      };
    }

    // Handle only errors
    if (errorItems > 0) {
      return {
        text: `${errorItems} operation${errorItems === 1 ? '' : 's'} failed`,
        colorStyle: { color: '#dc2626' }, // red-600
        icon: AlertCircle,
      };
    }

    return {
      text: `${totalItems} operation${totalItems === 1 ? '' : 's'} completed`,
      colorStyle: { color: '#16a34a' }, // green-600
      icon: CheckCircle,
    };
  };

  const headerInfo = getHeaderInfo();
  const hasActiveUploads = items.some(
    (item) => item.status === 'uploading' || item.status === 'pending' || item.status === 'paused'
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50">
        <div
          className="border custom-scrollbar rounded-lg shadow-lg w-full sm:w-80 max-h-96 flex flex-col"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--card-foreground)',
          }}
        >
          <div
            className="flex items-center justify-between p-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {headerInfo.icon && (
                <headerInfo.icon className="h-4 w-4 flex-shrink-0" style={headerInfo.colorStyle} />
              )}
              <span className="text-sm font-medium truncate" style={headerInfo.colorStyle}>
                {headerInfo.text}
              </span>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <AriaLabel label={isMinimized ? 'Expand upload panel' : 'Minimize upload panel'}>
                <button
                  onClick={isMinimized ? maximizeCard : minimizeCard}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-[var(--accent)]"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {isMinimized ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </AriaLabel>

              <AriaLabel label="Close upload panel">
                <button
                  onClick={handleCloseCard}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-accent"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <X className="h-4 w-4 text-[#dc2626]" />
                </button>
              </AriaLabel>
            </div>
          </div>

          {!isMinimized && (
            <div className="flex-1 overflow-y-auto">
              {items.map((item) => (
                <UploadItemComponent
                  key={item.id}
                  item={item}
                  onCancel={cancelUpload}
                  onPause={pauseUpload}
                  onResume={resumeUpload}
                  onRemove={removeItem}
                />
              ))}
            </div>
          )}

          {(isMinimized || hasActiveUploads) && (
            <div
              className="flex items-center justify-between p-2 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {hasActiveUploads && (
                  <div className="h-2 w-2 bg-[var(--primary)] rounded-full animate-pulse flex-shrink-0" />
                )}
                {!hasActiveUploads && completedItems > 0 && (
                  <CheckCircle className="h-3 w-3 text-[#16a34a] flex-shrink-0" />
                )}
                <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                  {hasActiveUploads
                    ? (() => {
                        const activeUploads = items.filter(
                          (i) => i.status === 'uploading' && i.operation === 'upload'
                        );
                        const activeDeletes = items.filter(
                          (i) => i.status === 'uploading' && i.operation === 'delete'
                        );
                        const calculatingSize = items.filter((i) => i.isCalculatingSize);

                        const parts = [];

                        if (calculatingSize.length > 0) {
                          parts.push(
                            `calculating ${calculatingSize.length} item${calculatingSize.length === 1 ? '' : 's'}`
                          );
                        }

                        if (activeUploads.length > 0) {
                          parts.push(
                            `uploading ${activeUploads.length} file${activeUploads.length === 1 ? '' : 's'}`
                          );
                        }

                        if (activeDeletes.length > 0) {
                          parts.push(
                            `deleting ${activeDeletes.length} item${activeDeletes.length === 1 ? '' : 's'}`
                          );
                        }

                        return parts.length > 0 ? parts.join(', ') + '...' : 'Processing...';
                      })()
                    : `${completedItems} completed`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <DuplicateDialog
        isOpen={duplicateDialog.isOpen}
        onClose={hideDuplicateDialog}
        onReplace={duplicateDialog.onReplace || (() => {})}
        onKeepBoth={duplicateDialog.onKeepBoth || (() => {})}
        duplicateItem={
          duplicateDialog.item
            ? {
                name: duplicateDialog.item.name,
                type: duplicateDialog.item.type,
                size: duplicateDialog.item.size,
                files: duplicateDialog.item.files,
              }
            : null
        }
      />
    </>
  );
}
