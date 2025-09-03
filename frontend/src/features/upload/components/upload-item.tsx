'use client';

import React from 'react';
import { CheckCircle, X, AlertCircle, Folder, Clock } from 'lucide-react';
import { UploadItem } from '../types';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { FolderIcon } from '@/shared/components/icons/folder-icons';
import { FileExtension } from '@/features/dashboard/types/file';

interface UploadItemComponentProps {
  item: UploadItem;
  onCancel?: (itemId: string) => void;
}

export function UploadItemComponent({ item, onCancel }: UploadItemComponentProps) {
  const getStatusIcon = () => {
    switch (item.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      case 'uploading':
      default:
        return (
          <div className="h-4 w-4 relative">
            {/* Progress circle */}
            <svg className="h-4 w-4 transform -rotate-90" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-200"
              />
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 10}`}
                strokeDashoffset={`${2 * Math.PI * 10 * (1 - item.progress / 100)}`}
                className="text-green-500 transition-all duration-300"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
    }
  };

  const getFileIcon = () => {
    if (item.type === 'folder') {
      return <FolderIcon className="h-6 w-6" />;
    }

    if (item.extension) {
      return <FileIcon extension={item.extension as FileExtension} className="h-6 w-6" />;
    }

    return <Folder className="h-6 w-6 text-gray-400" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getProgressText = () => {
    if (item.type === 'folder' && item.totalFiles && item.uploadedFiles !== undefined) {
      return `${item.uploadedFiles} of ${item.totalFiles}`;
    }
    if (item.status === 'uploading') {
      return `${Math.round(item.progress)}%`;
    }
    return '';
  };

  const showCancelButton = item.status === 'uploading' || item.status === 'pending';

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* File/Folder Icon */}
      <div className="flex-shrink-0">{getFileIcon()}</div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {item.name}
          </p>
          <div className="flex items-center gap-2 ml-2">
            {getProgressText() && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{getProgressText()}</span>
            )}
            {getStatusIcon()}
          </div>
        </div>

        {/* Progress bar for uploading files */}
        {item.status === 'uploading' && (
          <div className="mt-1">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* File size and status info */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatFileSize(item.size)}
          </span>

          {item.status === 'error' && item.error && (
            <span className="text-xs text-red-500 truncate ml-2">{item.error}</span>
          )}

          {showCancelButton && onCancel && (
            <button
              onClick={() => onCancel(item.id)}
              className="text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
