'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, X } from 'lucide-react';
import { isValidFolderName } from '@/features/upload/utils/sanitize-folder-name';

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
  type: 'file' | 'folder';
  isRenaming?: boolean;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentName,
  type,
  isRenaming = false,
}) => {
  const [newName, setNewName] = useState(currentName);
  const [validationError, setValidationError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
      setValidationError('');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();

          if (type === 'file') {
            const lastDotIndex = currentName.lastIndexOf('.');
            if (lastDotIndex > 0) {
              inputRef.current.setSelectionRange(0, lastDotIndex);
            } else {
              inputRef.current.select();
            }
          } else {
            inputRef.current.select();
          }
        }
      }, 100);
    }
  }, [isOpen, currentName, type]);

  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return 'Name cannot be empty';
    }

    if (name === currentName) {
      return 'Please enter a different name';
    }

    if (type === 'folder' && !isValidFolderName(name)) {
      return 'Invalid folder name. Use only letters, numbers, spaces, hyphens, and underscores.';
    }

    if (type === 'file') {
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(name)) {
        return 'File name contains invalid characters';
      }
    }

    return null;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewName(value);

    const error = validateName(value);
    setValidationError(error || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = newName.trim();
    const error = validateName(trimmedName);

    if (error) {
      setValidationError(error);
      return;
    }

    if (isRenaming) return;

    try {
      await onConfirm(trimmedName);
    } catch (error) {
      console.error('Rename failed:', error);
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

  if (!isOpen) {
    return null;
  }

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-card rounded-lg shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <Edit3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">Rename {type}</h2>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-md p-1 text-muted-foreground cursor-pointer hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cancel rename"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={handleNameChange}
                className={`w-full px-3 py-2 rounded-md bg-background text-foreground placeholder-muted-foreground outline-none transition-colors border ${
                  validationError ? 'border-red-500' : 'border-border focus:border-primary'
                }`}
                placeholder={`${type === 'file' ? 'File' : 'Folder'} name`}
                disabled={isRenaming}
                maxLength={255}
              />
              {validationError && <p className="text-sm text-red-500 mt-1">{validationError}</p>}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isRenaming}
                className="px-4 py-2 text-sm  cursor-pointer font-medium text-foreground bg-transparent rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isRenaming || !newName.trim() || !!validationError || newName === currentName
                }
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isRenaming ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialogContent, document.body) : null;
};
