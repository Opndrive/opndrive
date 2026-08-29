'use client';

import React, { useEffect, useState } from 'react';
import { File, Folder, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';

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
  /** How many prompts are waiting, this one included. */
  pendingCount?: number;
  /** Answers every waiting prompt with the same choice. */
  onApplyToAll?: (choice: 'replace' | 'keep-both') => void;
  /** Drops every waiting prompt, uploading none of them. */
  onCancelAll?: () => void;
}

export function DuplicateDialog({
  isOpen,
  onClose,
  onReplace,
  onKeepBoth,
  duplicateItem,
  pendingCount = 1,
  onApplyToAll,
  onCancelAll,
}: DuplicateDialogProps) {
  const [selectedAction, setSelectedAction] = useState<'replace' | 'keep-both'>('keep-both');
  const [applyToAll, setApplyToAll] = useState(false);

  /** Only worth offering when there is something else to apply the answer to. */
  const hasQueue = pendingCount > 1;
  const others = pendingCount - 1;

  /**
   * Cleared by hand, because the dialog is never unmounted between prompts:
   * answering one reveals the next while it stays open. Only on the way back
   * open, which happens between drops rather than between files, so ticking the
   * box for one batch cannot carry into the next.
   */
  useEffect(() => {
    if (isOpen) setApplyToAll(false);
  }, [isOpen]);

  const handleUpload = () => {
    if (applyToAll && onApplyToAll) {
      // No onClose here. Emptying the queue is what closes the dialog, and
      // calling it as well would dequeue from a queue that is already empty.
      onApplyToAll(selectedAction);
      return;
    }

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

  if (!duplicateItem) return null;

  return (
    // Stacks on top of the create-folder dialog, so it keeps the higher layer
    // the hand-rolled version had. Radix takes the focus trap with it, so the
    // newest dialog owns focus while it is open.
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[60] bg-black/30 backdrop-blur-sm"
        className="z-[60] max-w-md w-full gap-0 overflow-hidden rounded-lg p-0 shadow-xl"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
              {duplicateItem.type === 'file' ? 'File already exists' : 'Folder already exists'}
            </DialogTitle>
            {/* Without this there was no way to tell whether answering meant
                one more click or nine, which is most of what made repeating
                the same answer feel endless. */}
            {hasQueue && (
              <span
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
              >
                {pendingCount} left
              </span>
            )}
          </div>
          <DialogDescription className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            A {duplicateItem.type} named "{duplicateItem.name}" already exists in this location.
            What would you like to do?
          </DialogDescription>
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
              <p className="font-medium text-sm truncate" style={{ color: 'var(--foreground)' }}>
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
                <span className="text-sm font-medium block" style={{ color: 'var(--foreground)' }}>
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
                backgroundColor: selectedAction === 'keep-both' ? 'var(--accent)' : 'transparent',
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
                <span className="text-sm font-medium block" style={{ color: 'var(--foreground)' }}>
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

          {hasQueue && (
            <label
              className="mt-4 flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors"
              style={{
                backgroundColor: applyToAll ? 'var(--accent)' : 'transparent',
                border: applyToAll ? '1px solid var(--primary)' : '1px solid var(--border)',
              }}
            >
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: 'var(--primary)' }}
              />
              <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                Do the same for the other {others} {others === 1 ? 'item' : 'items'}
              </span>
            </label>
          )}
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
            {/* "Cancel" was only ever skipping this one file, which was not
                obvious while nine more waited behind it. */}
            {hasQueue ? 'Skip this one' : 'Cancel'}
          </button>
          {hasQueue && onCancelAll && (
            <button
              onClick={onCancelAll}
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
              Cancel all
            </button>
          )}
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
      </DialogContent>
    </Dialog>
  );
}
