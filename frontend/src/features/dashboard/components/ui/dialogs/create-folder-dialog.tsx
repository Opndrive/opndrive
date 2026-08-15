'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { describeFolderNameError } from '@/features/upload/utils/folder-name';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';

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
    }
    setIsCreating(false);
    setValidationError('');
  }, [isOpen, defaultName]);

  // Radix focuses the first focusable element on open, which would be the close
  // button. Take it over so the name lands selected and ready to overtype, the
  // way the old setTimeout was reaching for.
  const focusName = (event: Event) => {
    event.preventDefault();
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleFolderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFolderName(value);

    // Report the actual reason rather than a fixed sentence about letters and
    // numbers, which described rules none of the validation ever applied.
    setValidationError(value.trim() ? (describeFolderNameError(value) ?? '') : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!folderName.trim() || isCreating || validationError) return;

    const nameError = describeFolderNameError(folderName);
    if (nameError) {
      setValidationError(nameError);
      return;
    }

    setIsCreating(true);
    try {
      await onConfirm(folderName.trim());
    } catch (error) {
      console.error('Failed to create folder:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    // Escape used to be handled by an inner div, so it only worked while focus
    // happened to be inside it. Radix listens at the document and also traps
    // focus, restores it to whatever opened the dialog, and supplies the
    // role/aria-modal wiring this had none of.
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
            <FolderPlus className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg font-medium text-foreground">New folder</DialogTitle>
          </div>
          <DialogClose
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cancel create folder"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <DialogDescription className="sr-only">Enter a name for the new folder.</DialogDescription>

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

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCreating}
                className="px-4 py-2  text-sm cursor-pointer font-medium text-foreground bg-transparent rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !folderName.trim() || !!validationError}
                className="px-4 py-2 cursor-pointer text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
