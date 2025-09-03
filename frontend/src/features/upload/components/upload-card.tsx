'use client';

import React from 'react';
import { X, Minus, Plus, CheckCircle } from 'lucide-react';
import { useUploadStore } from '../hooks/use-upload-store';
import { UploadItemComponent } from './upload-item';

export function UploadCard() {
  const {
    isOpen,
    isMinimized,
    items,
    totalItems,
    completedItems,
    isUploading,
    closeCard,
    minimizeCard,
    maximizeCard,
    cancelUpload,
    clearCompleted,
  } = useUploadStore();

  if (!isOpen) return null;

  const getHeaderText = () => {
    if (totalItems === 0) return 'No uploads';

    const activeItems = items.filter(
      (item) => item.status === 'uploading' || item.status === 'pending'
    );

    if (activeItems.length > 0) {
      const queuedCount = items.filter((item) => item.status === 'pending').length;

      if (queuedCount > 0) {
        return `${totalItems} upload${totalItems === 1 ? '' : 's'} (${queuedCount} queued)`;
      } else {
        return `${totalItems} upload${totalItems === 1 ? '' : 's'}`;
      }
    } else {
      return `${totalItems} upload${totalItems === 1 ? '' : 's'} complete`;
    }
  };

  const getStatusText = () => {
    const activeItems = items.filter(
      (item) => item.status === 'uploading' || item.status === 'pending'
    );

    if (activeItems.length > 0) {
      return 'uploading';
    } else if (completedItems > 0) {
      return 'complete';
    }

    return '';
  };

  const allCompleted = completedItems === totalItems && totalItems > 0;
  const hasActiveUploads = isUploading;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className="border rounded-lg shadow-lg w-80 max-h-96 flex flex-col"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
          color: 'var(--card-foreground)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {getHeaderText()}
            </span>
            {getStatusText() && (
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {getStatusText()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Minimize/Maximize button */}
            <button
              onClick={isMinimized ? maximizeCard : minimizeCard}
              className="p-1 rounded transition-colors hover:opacity-80"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--muted)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              aria-label={isMinimized ? 'Maximize' : 'Minimize'}
            >
              {isMinimized ? (
                <Plus className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
              ) : (
                <Minus className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
              )}
            </button>

            {/* Close/Cancel button */}
            <button
              onClick={closeCard}
              className="p-1 rounded transition-colors hover:opacity-80"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--muted)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              aria-label={hasActiveUploads ? 'Cancel uploads' : 'Close'}
            >
              <X className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <>
            {/* Upload Items */}
            <div className="flex-1 overflow-y-auto max-h-64">
              {items.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    No uploads
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {items.map((item) => (
                    <UploadItemComponent key={item.id} item={item} onCancel={cancelUpload} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {allCompleted && (
              <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      All uploads completed
                    </span>
                  </div>

                  <button
                    onClick={clearCompleted}
                    className="text-xs transition-colors hover:opacity-80"
                    style={{ color: 'var(--primary)' }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Minimized Content */}
        {isMinimized && (
          <div className="p-2">
            <div className="flex items-center gap-2">
              {hasActiveUploads && (
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              )}
              {allCompleted && <CheckCircle className="h-3 w-3 text-green-500" />}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {hasActiveUploads
                  ? `Uploading ${items.filter((i) => i.status === 'uploading').length} files...`
                  : `${completedItems} completed`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
