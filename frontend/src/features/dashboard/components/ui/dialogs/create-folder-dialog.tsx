'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, X } from 'lucide-react';
import { isValidFolderName } from '@/features/upload/utils/sanitize-folder-name';

interface CreateFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (folderName: string) => void;
  defaultName?: string;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  defaultName = 'Untitled folder',
}) => {
  const [folderName, setFolderName] = useState(defaultName);
  const [isCreating, setIsCreating] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName(defaultName);
      setIsCreating(false); // Reset creating state when dialog opens
      setValidationError(''); // Reset validation error
      // Focus and select text after dialog is fully rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    } else {
      // Reset state when dialog closes
      setIsCreating(false);
      setValidationError('');
    }
  }, [isOpen, defaultName]);

  const handleFolderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFolderName(value);

    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError('');
    }

    // Validate folder name
    if (value.trim() && !isValidFolderName(value)) {
      setValidationError(
        'Folder name contains invalid characters. Use only letters, numbers, spaces, hyphens, and underscores.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!folderName.trim() || isCreating || validationError) return;

    // Final validation before submit
    if (!isValidFolderName(folderName)) {
      setValidationError(
        'Invalid folder name. Please use only letters, numbers, spaces, hyphens, and underscores.'
      );
      return;
    }

    setIsCreating(true);
    try {
      await onConfirm(folderName.trim());
      // Success handling is done by parent component
    } catch {
      // Error handling is done by parent component
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-card rounded-lg shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <FolderPlus className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">New folder</h2>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="text"
                value={folderName}
                onChange={handleFolderNameChange}
                className={`w-full px-3 py-2 rounded-md bg-background text-foreground placeholder-muted-foreground outline-none transition-colors ${
                  validationError ? 'border border-red-500' : ''
                }`}
                placeholder="Folder name"
                disabled={isCreating}
                maxLength={255}
              />
              {validationError && <p className="text-sm text-red-500 mt-1">{validationError}</p>}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCreating}
                className="px-4 py-2 text-sm font-medium text-foreground bg-transparent rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !folderName.trim() || !!validationError}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialogContent, document.body) : null;
};
