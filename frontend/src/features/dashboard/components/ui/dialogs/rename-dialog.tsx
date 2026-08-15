'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Edit3, X } from 'lucide-react';
import { describeFolderNameError } from '@/features/upload/utils/folder-name';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';

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
    }
  }, [isOpen, currentName, type]);

  // Radix would focus the close button first. Take it over so the name is
  // selected and ready to overtype, with a file's extension left out of the
  // selection the way the old setTimeout did it.
  const focusName = (event: Event) => {
    event.preventDefault();
    const input = inputRef.current;
    if (!input) return;

    input.focus();
    const lastDotIndex = currentName.lastIndexOf('.');
    if (type === 'file' && lastDotIndex > 0) {
      input.setSelectionRange(0, lastDotIndex);
    } else {
      input.select();
    }
  };

  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return 'Name cannot be empty';
    }

    if (name === currentName) {
      return 'Please enter a different name';
    }

    if (type === 'folder') {
      const nameError = describeFolderNameError(name);
      if (nameError) return nameError;
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

  return (
    // Escape was handled by an inner div, so it only worked while focus was
    // inside it. Radix listens at the document, traps focus, restores it on
    // close, and supplies the dialog role and aria-modal this never had.
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={focusName}
        // border-0: the shared content styling carries a border, but this card
        // never had one and it reads as a hard outline against the backdrop.
        className="w-full max-w-md gap-0 rounded-lg border-0 bg-card p-0 shadow-xl"
      >
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <Edit3 className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg font-medium text-foreground">Rename {type}</DialogTitle>
          </div>
          <DialogClose
            className="rounded-md p-1 text-muted-foreground cursor-pointer hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cancel rename"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <DialogDescription className="sr-only">Enter a new name for this {type}.</DialogDescription>

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
      </DialogContent>
    </Dialog>
  );
};
