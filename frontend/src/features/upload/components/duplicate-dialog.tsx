'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { File, Folder, AlertTriangle } from 'lucide-react';

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
  const [selectedAction, setSelectedAction] = useState<'replace' | 'keep-both'>('keep-both');

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
              <div className="flex items-center gap-3 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
                  {duplicateItem.type === 'file' ? 'File already exists' : 'Folder already exists'}
                </h2>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                A {duplicateItem.type} named "{duplicateItem.name}" already exists in this location.
                What would you like to do?
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
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Existing {duplicateItem.type} in this location
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <div className="space-y-3">
                <label
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selectedAction === 'replace' ? 'var(--accent)' : 'transparent',
                    border:
                      selectedAction === 'replace'
                        ? '1px solid var(--primary)'
                        : '1px solid var(--border)',
                  }}
                  onClick={() => setSelectedAction('replace')}
                >
                  <div className="relative mt-0.5">
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
                  <div className="flex-1">
                    <span
                      className="text-sm font-medium block"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {duplicateItem.type === 'file'
                        ? 'Replace existing file'
                        : 'Merge with existing folder'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {duplicateItem.type === 'file'
                        ? 'The existing file will be replaced with the new one'
                        : 'Contents will be merged with the existing folder'}
                    </span>
                  </div>
                </label>

                <label
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
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
                  <div className="relative mt-0.5">
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
                  <div className="flex-1">
                    <span
                      className="text-sm font-medium block"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {duplicateItem.type === 'file' ? 'Keep both files' : 'Keep both folders'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {duplicateItem.type === 'file'
                        ? 'The new file will be saved with a unique name'
                        : 'The renamed folder will be saved with a unique name'}
                    </span>
                  </div>
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
                className="px-4 py-2 cursor-pointer text-sm font-medium transition-colors rounded-md"
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
                className="px-6 py-2 text-sm cursor-pointer font-medium rounded-md transition-colors"
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
        </div>,
        document.body
      )
    : null;
}
