'use client';

import React from 'react';
import {
  X,
  CheckCircle,
  AlertCircle,
  XCircle,
  Upload,
  Loader2,
  Pause,
  Play,
  Minus,
} from 'lucide-react';
import { UploadItem } from '../types';
import { AriaLabel } from '@/shared/components';

interface UploadItemComponentProps {
  item: UploadItem;
  onCancel: (itemId: string) => void;
  onPause: (itemId: string) => void;
  onResume: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
}

export function UploadItemComponent({
  item,
  onCancel,
  onPause,
  onResume,
  onRemove,
}: UploadItemComponentProps) {
  // Format file size helper
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    // First check if upload is completed (100% progress)
    if (item.progress >= 100 || item.status === 'completed') {
      return <CheckCircle className="h-4 w-4" style={{ color: '#16a34a' }} />;
    }

    // Check if this is actively uploading from queue
    if (typeof window !== 'undefined' && window.__upload_queue_manager) {
      const queueManager = window.__upload_queue_manager;
      const isActive = queueManager.isUploadActive(item.id);

      if (isActive && item.progress > 0 && item.progress < 100) {
        return <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--primary)' }} />;
      }
    }

    switch (item.status) {
      case 'error':
        return <AlertCircle className="h-4 w-4" style={{ color: '#dc2626' }} />;
      case 'cancelled':
        return <XCircle className="h-4 w-4" style={{ color: '#dc2626' }} />;
      case 'uploading':
        return item.progress >= 100 ? (
          <CheckCircle className="h-4 w-4" style={{ color: '#16a34a' }} />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--primary)' }} />
        );
      case 'paused':
        return <Pause className="h-4 w-4" style={{ color: '#d97706' }} />;
      case 'pending':
        return <Upload className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />;
      default:
        // This handles 'completed' and any other states
        return <CheckCircle className="h-4 w-4" style={{ color: '#16a34a' }} />;
    }
  };

  const getStatusColorStyle = () => {
    // First check if upload is completed (100% progress)
    if (item.progress >= 100 || item.status === 'completed') {
      return { color: '#16a34a' }; // green-600
    }

    switch (item.status) {
      case 'error':
        return { color: '#dc2626' }; // red-600
      case 'cancelled':
        return { color: '#dc2626' }; // red-600
      case 'uploading':
        return item.progress >= 100 ? { color: '#16a34a' } : { color: 'var(--primary)' };
      case 'paused':
        return { color: '#d97706' }; // orange-600
      case 'pending':
        return { color: 'var(--muted-foreground)' };
      default:
        return { color: '#16a34a' }; // green-600
    }
  };

  const getProgressBarStyle = () => {
    // First check if upload is completed (100% progress)
    if (item.progress >= 100 || item.status === 'completed') {
      return { backgroundColor: '#16a34a' }; // green-600
    }

    // Check if this is actively uploading from queue
    if (typeof window !== 'undefined' && window.__upload_queue_manager) {
      const queueManager = window.__upload_queue_manager;
      const isActive = queueManager.isUploadActive(item.id);

      if (isActive && item.progress > 0 && item.progress < 100) {
        return { backgroundColor: 'var(--primary)' }; // Use primary color for active uploads
      }
    }

    switch (item.status) {
      case 'error':
        return { backgroundColor: '#dc2626' }; // red-600
      case 'cancelled':
        return { backgroundColor: '#dc2626' }; // red-600
      case 'uploading':
        return item.progress >= 100
          ? { backgroundColor: '#16a34a' }
          : { backgroundColor: 'var(--primary)' };
      case 'paused':
        return { backgroundColor: '#d97706' }; // orange-600
      case 'pending':
        return { backgroundColor: 'var(--muted-foreground)' };
      default:
        return { backgroundColor: '#16a34a' }; // green-600 for completed
    }
  };

  const getStatusText = () => {
    // First check if upload is completed (100% progress)
    if (item.progress >= 100 || item.status === 'completed') {
      return 'Completed';
    }

    switch (item.status) {
      case 'error':
        return item.error || 'Failed';
      case 'cancelled':
        if (item.type === 'folder' && item.uploadedFiles && item.uploadedFiles > 0) {
          return `Cancelled - ${item.uploadedFiles} files uploaded`;
        }
        return 'Cancelled';
      case 'uploading':
        return item.progress >= 100 ? 'Completed' : 'Uploading...';
      case 'paused':
        if (item.type === 'folder' && item.uploadedFiles && item.uploadedFiles > 0) {
          return `Paused - ${item.uploadedFiles} files uploaded`;
        }
        return 'Paused';
      case 'pending':
        // Check if this is in the upload queue for better status
        if (typeof window !== 'undefined' && window.__upload_queue_manager) {
          const queueManager = window.__upload_queue_manager;
          const isActive = queueManager.isUploadActive(item.id);
          const position = queueManager.getQueuePosition(item.id);

          // If this upload is actively running, show as uploading
          if (isActive && item.progress > 0) {
            return 'Uploading...';
          }

          // If it's in queue, show queue status
          if (position >= 0) {
            if (position === 0) {
              return 'Next in queue';
            } else {
              return `Queued #${position + 1}`;
            }
          }
        }
        return 'Waiting to start...';
      default:
        // This handles 'completed' and any other states
        return 'Completed';
    }
  };

  return (
    <div
      className="flex items-center gap-3 p-3 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex-shrink-0">{getStatusIcon()}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
              {item.name}
            </p>
            <div
              className="flex items-center gap-1 sm:gap-2 text-xs flex-wrap"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <span>{formatFileSize(item.size)}</span>
              {item.type === 'folder' && item.totalFiles && (
                <span className="whitespace-nowrap">
                  • {item.uploadedFiles || 0} of {item.totalFiles} files
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {(item.status === 'uploading' ||
              (item.status === 'pending' &&
                typeof window !== 'undefined' &&
                window.__upload_queue_manager?.isUploadActive(item.id) &&
                item.progress > 0)) && (
              <>
                <AriaLabel label="Pause upload">
                  <button
                    onClick={() => onPause(item.id)}
                    className="p-1 rounded cursor-pointer transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/20"
                  >
                    <Pause className="h-3 w-3" style={{ color: '#d97706' }} />
                  </button>
                </AriaLabel>
                <AriaLabel label="Cancel upload">
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                  >
                    <X className="h-3 w-3" style={{ color: '#dc2626' }} />
                  </button>
                </AriaLabel>
              </>
            )}
            {item.status === 'paused' && (
              <>
                <AriaLabel label="Resume upload">
                  <button
                    onClick={() => onResume(item.id)}
                    className="p-1 rounded cursor-pointer transition-colors hover:bg-green-100 dark:hover:bg-green-900/20"
                  >
                    <Play className="h-3 w-3" style={{ color: '#16a34a' }} />
                  </button>
                </AriaLabel>
                <AriaLabel label="Cancel upload">
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                  >
                    <X className="h-3 w-3" style={{ color: '#dc2626' }} />
                  </button>
                </AriaLabel>
              </>
            )}
            {item.status === 'pending' &&
              !(
                typeof window !== 'undefined' &&
                window.__upload_queue_manager?.isUploadActive(item.id) &&
                item.progress > 0
              ) && (
                <AriaLabel label="Cancel upload">
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                  >
                    <X className="h-3 w-3" style={{ color: '#dc2626' }} />
                  </button>
                </AriaLabel>
              )}
            {(item.status === 'completed' ||
              item.status === 'cancelled' ||
              item.status === 'error') &&
              onRemove && (
                <AriaLabel label="Remove from list">
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-1 rounded cursor-pointer transition-all duration-200 hover:bg-accent  hover:scale-110"
                  >
                    <Minus
                      className="h-3 w-3 transition-colors"
                      style={{ color: 'var(--muted-foreground)' }}
                    />
                  </button>
                </AriaLabel>
              )}
          </div>
        </div>

        <div className="mt-2">
          <div
            className="w-full rounded-full h-1.5"
            style={{ backgroundColor: 'var(--progress-track)' }}
          >
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, item.progress))}%`,
                ...getProgressBarStyle(),
              }}
            />
          </div>

          <div className="flex items-start justify-between mt-1 gap-2">
            <span
              className="text-xs flex-1 leading-tight"
              style={{
                wordBreak: 'break-word',
                lineHeight: '1.2',
                ...getStatusColorStyle(),
              }}
            >
              {getStatusText()}
            </span>
            <span
              className="text-xs flex-shrink-0 ml-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {item.progress.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
