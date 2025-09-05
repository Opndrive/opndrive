'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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

  return typeof window !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
            onClick={handleCancel}
          />

          <div
            className="relative rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="px-6 py-4">
              <h2 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
                Upload options
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {duplicateItem.name} already exists in this location. Do you want to replace the
                existing {duplicateItem.type} with a new version or keep both{' '}
                {duplicateItem.type === 'file' ? 'files' : 'folders'}?
              </p>
            </div>

            <div className="px-6 pb-4">
              <div
                className="flex items-center  gap-3 p-3 rounded-lg"
                style={{ backgroundColor: 'var(--muted)' }}
              >
                {duplicateItem.type === 'file' ? (
                  <File className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                ) : (
                  <Folder className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-sm truncate"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {duplicateItem.name}
                  </p>
                  {duplicateItem.type === 'file' && duplicateItem.size && (
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {formatFileSize(duplicateItem.size)}
                    </p>
                  )}
                  {duplicateItem.type === 'folder' && duplicateItem.files && (
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {duplicateItem.files.length}{' '}
                      {duplicateItem.files.length === 1 ? 'file' : 'files'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <div className="space-y-3">
                <label
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selectedAction === 'replace' ? 'var(--accent)' : 'transparent',
                    border:
                      selectedAction === 'replace'
                        ? '1px solid var(--primary)'
                        : '1px solid var(--border)',
                  }}
                  onClick={() => setSelectedAction('replace')}
                >
                  <div className="relative">
                    <input
                      type="radio"
                      name="duplicate-action"
                      value="replace"
                      checked={selectedAction === 'replace'}
                      onChange={() => setSelectedAction('replace')}
                      className="w-4 h-4"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Replace existing {duplicateItem.type}
                  </span>
                </label>

                <label
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    backgroundColor:
                      selectedAction === 'keep-both' ? 'var(--accent)' : 'transparent',
                    border:
                      selectedAction === 'keep-both'
                        ? '1px solid var(--primary)'
                        : '1px solid var(--border)',
                  }}
                  onClick={() => setSelectedAction('keep-both')}
                >
                  <div className="relative">
                    <input
                      type="radio"
                      name="duplicate-action"
                      value="keep-both"
                      checked={selectedAction === 'keep-both'}
                      onChange={() => setSelectedAction('keep-both')}
                      className="w-4 h-4"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Keep both {duplicateItem.type === 'file' ? 'files' : 'folders'}
                  </span>
                </label>
              </div>
            </div>

            <div
              className="px-6 py-4 flex justify-end gap-3"
              style={{
                backgroundColor: 'var(--muted)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium transition-colors rounded-md"
                style={{
                  color: 'var(--muted-foreground)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="px-6 py-2 text-sm font-medium rounded-md transition-colors"
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
                Upload
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;
}
