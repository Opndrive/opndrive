'use client';

import React from 'react';
import { X, Minus, Plus, CheckCircle, AlertCircle, XCircle, Pause, Upload } from 'lucide-react';
import { useUploadStore } from '../hooks/use-upload-store';
import { UploadItemComponent } from './upload-item';
import { DuplicateDialog } from './duplicate-dialog';

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
    clearCompleted,
    hideDuplicateDialog,
  } = useUploadStore();

  // Hide card when not open or when there are no items
  if (!isOpen || items.length === 0) {
    return null;
  }

  const handleCloseCard = () => {
    // Always close the card when X is clicked - force close even during uploads
    // If there are completed items, clear them first, then close
    const hasActiveUploads = items.some(
      (item) => item.status === 'uploading' || item.status === 'pending'
    );

    if (!hasActiveUploads) {
      clearCompleted();
    }
    forceCloseCard();
  };

  const getHeaderInfo = () => {
    if (totalItems === 0) return { text: 'No uploads', color: 'text-muted-foreground' };

    const activeItems = items.filter(
      (item) => item.status === 'uploading' || item.status === 'pending'
    );

    const actuallyCompleted = items.filter((item) => item.status === 'completed').length;
    const cancelledItems = items.filter((item) => item.status === 'cancelled').length;
    const errorItems = items.filter((item) => item.status === 'error').length;
    const pausedItems = items.filter((item) => item.status === 'paused').length;

    // Handle active uploads
    if (activeItems.length > 0) {
      const queuedCount = items.filter((item) => item.status === 'pending').length;

      if (queuedCount > 0) {
        return {
          text: `Uploading ${totalItems} file${totalItems === 1 ? '' : 's'} (${queuedCount} queued)`,
          color: 'text-blue-600',
          icon: Upload,
        };
      } else {
        return {
          text: `Uploading ${totalItems} file${totalItems === 1 ? '' : 's'}`,
          color: 'text-blue-600',
          icon: Upload,
        };
      }
    }

    // Handle paused uploads
    if (pausedItems > 0) {
      return {
        text: `${pausedItems} upload${pausedItems === 1 ? '' : 's'} paused`,
        color: 'text-orange-600',
        icon: Pause,
      };
    }

    // Handle finished uploads with mixed results
    if (actuallyCompleted > 0 && (cancelledItems > 0 || errorItems > 0)) {
      const failedCount = cancelledItems + errorItems;
      return {
        text: `${actuallyCompleted} completed, ${failedCount} failed`,
        color: 'text-orange-600',
        icon: AlertCircle,
      };
    }

    // Handle only completed
    if (actuallyCompleted > 0) {
      return {
        text: `${actuallyCompleted} upload${actuallyCompleted === 1 ? '' : 's'} completed`,
        color: 'text-green-600',
        icon: CheckCircle,
      };
    }

    // Handle only cancelled
    if (cancelledItems > 0) {
      return {
        text: `${cancelledItems} upload${cancelledItems === 1 ? '' : 's'} cancelled`,
        color: 'text-red-600',
        icon: XCircle,
      };
    }

    // Handle only errors
    if (errorItems > 0) {
      return {
        text: `${errorItems} upload${errorItems === 1 ? '' : 's'} failed`,
        color: 'text-red-600',
        icon: AlertCircle,
      };
    }

    return {
      text: `${totalItems} upload${totalItems === 1 ? '' : 's'} completed`,
      color: 'text-green-600',
      icon: CheckCircle,
    };
  };

  const headerInfo = getHeaderInfo();
  const hasActiveUploads = items.some(
    (item) => item.status === 'uploading' || item.status === 'pending'
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <div
          className="border rounded-lg shadow-lg w-80 max-h-96 flex flex-col"
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
            <div className="flex items-center gap-2">
              {headerInfo.icon && <headerInfo.icon className={`h-4 w-4 ${headerInfo.color}`} />}
              <span className={`text-sm font-medium ${headerInfo.color}`}>{headerInfo.text}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={isMinimized ? maximizeCard : minimizeCard}
                className="p-1 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label={isMinimized ? 'Maximize' : 'Minimize'}
              >
                {isMinimized ? (
                  <Plus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Minus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                )}
              </button>

              <button
                onClick={handleCloseCard}
                className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-red-600" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <div className="flex-1 overflow-y-auto">
              {items.map((item) => (
                <UploadItemComponent key={item.id} item={item} onCancel={cancelUpload} />
              ))}
            </div>
          )}

          {(isMinimized || hasActiveUploads) && (
            <div
              className="flex items-center justify-between p-2 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                {hasActiveUploads && (
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                )}
                {!hasActiveUploads && completedItems > 0 && (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                )}
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {hasActiveUploads
                    ? `Uploading ${items.filter((i) => i.status === 'uploading').length} files...`
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
