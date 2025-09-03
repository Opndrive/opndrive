'use client';

import React from 'react';
import { X, CheckCircle, AlertCircle, XCircle, Pause, Upload, Loader2 } from 'lucide-react';
import { UploadItem } from '../types';

interface UploadItemComponentProps {
  item: UploadItem;
  onCancel: (itemId: string) => void;
}

export function UploadItemComponent({ item, onCancel }: UploadItemComponentProps) {
  // Format file size helper
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    switch (item.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-orange-600" />;
      case 'uploading':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
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
      case 'paused':
        return 'text-orange-600';
      case 'uploading':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const getProgressBarColor = () => {
    switch (item.status) {
      case 'completed':
        return 'bg-green-600';
      case 'error':
        return 'bg-red-600';
      case 'cancelled':
        return 'bg-red-600';
      case 'paused':
        return 'bg-orange-600';
      case 'uploading':
        return 'bg-blue-600';
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
        return 'Cancelled';
      case 'paused':
        return 'Paused - Waiting for user input';
      case 'uploading':
        return 'Uploading...';
      case 'pending':
        return 'Queued';
      default:
        return '';
    }
  };

  return (
    <div
      className="flex items-center gap-3 p-3 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* File/Folder Icon and Status */}
      <div className="flex-shrink-0">{getStatusIcon()}</div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
              {item.name}
            </p>
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <span>{formatFileSize(item.size)}</span>
              {item.type === 'folder' && item.totalFiles && (
                <span>
                  • {item.uploadedFiles || 0} of {item.totalFiles} files
                </span>
              )}
            </div>
          </div>

          {/* Cancel Button - only show for active uploads */}
          {(item.status === 'uploading' || item.status === 'pending') && (
            <button
              onClick={() => onCancel(item.id)}
              className="p-1 rounded transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
              aria-label="Cancel upload"
            >
              <X className="h-3 w-3 text-red-600" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-2">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
              style={{ width: `${item.progress}%` }}
            />
          </div>

          {/* Status Text */}
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs ${getStatusColor()}`}>{getStatusText()}</span>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {item.progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
