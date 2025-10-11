'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

type OperationType = 'folder-rename' | 'folder-delete' | 'search-operation';

interface CreditWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  operationType: OperationType;
}

const operationConfig = {
  'folder-rename': {
    title: 'Rename Folder',
    warning: 'This operation may consume additional credits',
    description:
      'Renaming folders requires updating metadata for all contained files and subfolders in your S3 storage. Each file needs to be copied to the new path and the old file deleted, which counts as separate operations. Large folders with hundreds or thousands of files can result in significant credit usage.',
    storageKey: 'opndrive-folder-rename-warning-dismissed',
  },
  'folder-delete': {
    title: 'Delete Folder',
    warning: 'This operation may consume significant credits',
    description:
      'Deleting folders requires individual deletion of every file and subfolder within the directory. Each item deletion is billed as a separate operation in S3. Folders containing many files, especially with complex nested structures, will consume credits proportional to the total number of items being removed.',
    storageKey: 'opndrive-folder-delete-warning-dismissed',
  },
  'search-operation': {
    title: 'Search Files',
    warning: 'Search operations may consume additional credits',
    description:
      'File searches require scanning through your entire S3 bucket structure to find matching results. This involves listing operations across all directories and examining file metadata. Large storage accounts with thousands of files will result in higher credit usage as more data needs to be processed.',
    storageKey: 'opndrive-search-warning-dismissed',
  },
};

export function CreditWarningDialog({
  isOpen,
  onClose,
  onConfirm,
  operationType,
}: CreditWarningDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const config = operationConfig[operationType];

  // Reset checkbox when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false);
      // Disable body scroll when dialog is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem(config.storageKey, 'true');
    }
    onConfirm();
    onClose();
  };

  const handleClose = () => {
    setDontShowAgain(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  // Don't render anything if not open
  if (!isOpen) return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
        onClick={(e) => {
          // Only close if clicking the backdrop itself (not the dialog)
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity pointer-events-none"
          aria-hidden="true"
        />

        {/* This element is to trick the browser into centering the modal contents. */}
        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen pointer-events-none"
          aria-hidden="true"
        >
          &#8203;
        </span>

        {/* Dialog panel */}
        <div
          className="relative inline-block align-bottom rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full border pointer-events-auto"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--border)',
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-6 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--accent)' }}>
                <AlertTriangle className="h-5 w-5" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                  {config.title}
                </h2>
                <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                  {config.warning}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg transition-colors cursor-pointer hover:opacity-80"
              style={{ backgroundColor: 'var(--secondary)' }}
              aria-label="Close warning"
            >
              <X className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              {config.description}
            </div>

            <div
              className="p-4 rounded-lg border"
              style={{
                backgroundColor: 'var(--accent)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="h-4 w-4 mt-0.5 flex-shrink-0"
                  style={{ color: 'var(--primary)' }}
                />
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  <strong>Credit Usage Notice:</strong> This operation involves multiple S3 API
                  calls. Each file operation (copy, delete, list) consumes credits based on AWS
                  pricing. Your current credit balance will be updated accordingly.
                </div>
              </div>
            </div>

            {/* Don't show again checkbox */}
            <div className="flex items-center gap-3 pt-2">
              <input
                id="dont-show-again"
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded"
                style={{
                  accentColor: 'var(--primary)',
                  borderColor: 'var(--border)',
                }}
              />
              <label
                htmlFor="dont-show-again"
                className="text-sm cursor-pointer"
                style={{ color: 'var(--muted-foreground)' }}
              >
                I understand and don't show this warning again
              </label>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 p-6 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <Button variant="outline" onClick={handleClose} className="min-w-[80px]">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              className="min-w-[100px] text-white"
              style={{
                backgroundColor: 'var(--primary)',
                borderColor: 'var(--primary)',
              }}
            >
              I Understand
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialogContent, document.body) : null;
}

// Utility function to check if warning should be shown
export function shouldShowCreditWarning(operationType: OperationType): boolean {
  const config = operationConfig[operationType];
  const dismissed = localStorage.getItem(config.storageKey);
  return dismissed !== 'true';
}
