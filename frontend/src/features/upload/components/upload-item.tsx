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
    // Check if this is actively uploading from queue
    if (typeof window !== 'undefined' && window.__upload_queue_manager) {
      const queueManager = window.__upload_queue_manager;
      const isActive = queueManager.isUploadActive(item.id);

      if (isActive && item.progress > 0) {
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      }
    }

    switch (item.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'uploading':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-orange-600" />;
      default:
        return <Upload className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case 'completed':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'cancelled':
        return 'text-red-600';
      case 'uploading':
        return 'text-blue-600';
      case 'paused':
        return 'text-orange-600';
      default:
        return 'text-gray-600';
    }
  };

  const getProgressBarColor = () => {
    // Check if this is actively uploading from queue
    if (typeof window !== 'undefined' && window.__upload_queue_manager) {
      const queueManager = window.__upload_queue_manager;
      const isActive = queueManager.isUploadActive(item.id);

      if (isActive && item.progress > 0) {
        return 'bg-blue-600'; // Show blue for active uploads
      }
    }

    switch (item.status) {
      case 'completed':
        return 'bg-green-600';
      case 'error':
        return 'bg-red-600';
      case 'cancelled':
        return 'bg-red-600';
      case 'uploading':
        return 'bg-blue-600';
      case 'paused':
        return 'bg-orange-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'completed':
        return 'Completed';
      case 'error':
        return item.error || 'Failed';
      case 'cancelled':
        if (item.type === 'folder' && item.uploadedFiles && item.uploadedFiles > 0) {
          return `Cancelled - ${item.uploadedFiles} files uploaded`;
        }
        return 'Cancelled';
      case 'uploading':
        return 'Uploading...';
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
        return '';
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
                <button
                  onClick={() => onPause(item.id)}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/20"
                  aria-label="Pause upload"
                >
                  <Pause className="h-3 w-3 text-orange-600" />
                </button>
                <button
                  onClick={() => onCancel(item.id)}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                  aria-label="Cancel upload"
                >
                  <X className="h-3 w-3 text-red-600" />
                </button>
              </>
            )}
            {item.status === 'paused' && (
              <>
                <button
                  onClick={() => onResume(item.id)}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-green-100 dark:hover:bg-green-900/20"
                  aria-label="Resume upload"
                >
                  <Play className="h-3 w-3 text-green-600" />
                </button>
                <button
                  onClick={() => onCancel(item.id)}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                  aria-label="Cancel upload"
                >
                  <X className="h-3 w-3 text-red-600" />
                </button>
              </>
            )}
            {item.status === 'pending' &&
              !(
                typeof window !== 'undefined' &&
                window.__upload_queue_manager?.isUploadActive(item.id) &&
                item.progress > 0
              ) && (
                <button
                  onClick={() => onCancel(item.id)}
                  className="p-1 rounded cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                  aria-label="Cancel upload"
                >
                  <X className="h-3 w-3 text-red-600" />
                </button>
              )}
            {(item.status === 'completed' ||
              item.status === 'cancelled' ||
              item.status === 'error') &&
              onRemove && (
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-1 rounded cursor-pointer transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-110"
                  aria-label="Remove from list"
                  title="Remove from list"
                >
                  <Minus className="h-3 w-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" />
                </button>
              )}
          </div>
        </div>

        <div className="mt-2">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
              style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
            />
          </div>

          <div className="flex items-start justify-between mt-1 gap-2">
            <span
              className={`text-xs flex-1 leading-tight ${getStatusColor()}`}
              style={{ wordBreak: 'break-word', lineHeight: '1.2' }}
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
