'use client';

import React, { useState } from 'react';
import { File, Folder } from 'lucide-react';

// Format file size helper
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export interface DuplicateItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  files?: File[];
}

interface DuplicateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onReplace: () => void;
  onKeepBoth: () => void;
  duplicateItem: DuplicateItem | null;
}

export function DuplicateDialog({
  isOpen,
  onClose,
  onReplace,
  onKeepBoth,
  duplicateItem,
}: DuplicateDialogProps) {
  const [selectedAction, setSelectedAction] = useState<'replace' | 'keep-both'>('replace');

  if (!isOpen || !duplicateItem) return null;

  const handleUpload = () => {
    if (selectedAction === 'keep-both') {
      onKeepBoth();
    } else {
      onReplace();
    }
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={handleCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4">
          <h2 className="text-lg font-medium text-gray-900">Upload options</h2>
          <p className="mt-2 text-sm text-gray-600">
            {duplicateItem.name} already exists in this location. Do you want to replace the
            existing {duplicateItem.type}
            with a new version or keep both {duplicateItem.type === 'file' ? 'files' : 'folders'}?
            Replacing the {duplicateItem.type} won't change sharing settings.
          </p>
        </div>

        {/* File/Folder Info */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            {duplicateItem.type === 'file' ? (
              <File className="h-5 w-5 text-blue-600 flex-shrink-0" />
            ) : (
              <Folder className="h-5 w-5 text-blue-600 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">{duplicateItem.name}</p>
              {duplicateItem.type === 'file' && duplicateItem.size && (
                <p className="text-xs text-gray-500">{formatFileSize(duplicateItem.size)}</p>
              )}
              {duplicateItem.type === 'folder' && duplicateItem.files && (
                <p className="text-xs text-gray-500">
                  {duplicateItem.files.length} {duplicateItem.files.length === 1 ? 'file' : 'files'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="px-6 pb-6">
          <div className="space-y-3">
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                selectedAction === 'replace'
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => setSelectedAction('replace')}
            >
              <div className="relative">
                <input
                  type="radio"
                  name="duplicate-action"
                  value="replace"
                  checked={selectedAction === 'replace'}
                  onChange={() => setSelectedAction('replace')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
              </div>
              <span className="text-sm font-medium text-gray-900">
                Replace existing {duplicateItem.type}
              </span>
            </label>

            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                selectedAction === 'keep-both'
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => setSelectedAction('keep-both')}
            >
              <div className="relative">
                <input
                  type="radio"
                  name="duplicate-action"
                  value="keep-both"
                  checked={selectedAction === 'keep-both'}
                  onChange={() => setSelectedAction('keep-both')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
              </div>
              <span className="text-sm font-medium text-gray-900">
                Keep both {duplicateItem.type === 'file' ? 'files' : 'folders'}
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}
