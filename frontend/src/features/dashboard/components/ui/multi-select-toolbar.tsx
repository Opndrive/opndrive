'use client';

import { useMultiSelectStore } from '../../stores/use-multi-select-store';
import {
  HiOutlineX,
  HiOutlineShare,
  HiOutlineDownload,
  HiOutlineTrash,
  HiOutlineEye,
} from 'react-icons/hi';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useMultiSelectActions } from '../../hooks/use-multi-select-actions';

export function MultiSelectToolbar() {
  const { selectedItems, selectedType, clearSelection, getSelectionCount } = useMultiSelectStore();
  const { handleOpenFiles, handleDownloadFiles, handleShareFiles, handleDeleteItems } =
    useMultiSelectActions();

  const count = getSelectionCount();

  // Determine what actions are available based on selection
  const hasFiles = selectedItems.some(
    (item) => 'Key' in item && item.Key && !item.Key.endsWith('/')
  );

  const isFilesOnly = selectedType === 'file';

  // Action availability
  const canOpen = isFilesOnly && hasFiles; // Only files can be opened
  const canDownload = isFilesOnly && hasFiles; // Only files can be downloaded (no folders)
  const canShare = isFilesOnly && hasFiles; // Only files can be shared
  const canDelete = count > 0; // Both files and folders can be deleted

  if (count === 0) {
    return null;
  }

  return (
    <div
      data-multi-select-toolbar
      className="w-full px-4 py-2 rounded-2xl shadow-md flex items-center justify-between transition-all duration-200"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Left side: Selection count and close button */}
      <div className="flex items-center gap-3">
        <AriaLabel label="Clear selection">
          <button
            onClick={clearSelection}
            className="p-1 rounded-full transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineX size={18} />
          </button>
        </AriaLabel>

        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          {count} selected
        </span>
      </div>

      {/* Right side: Action buttons */}
      <div className="flex items-center gap-1">
        {/* Open button - only for files */}
        <AriaLabel label={canOpen ? 'Open' : 'Open (files only)'}>
          <button
            onClick={() => canOpen && handleOpenFiles(selectedItems)}
            disabled={!canOpen}
            className={`p-2 rounded-full transition-colors ${
              canOpen ? 'hover:bg-accent' : 'opacity-50 cursor-not-allowed'
            }`}
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineEye size={18} />
          </button>
        </AriaLabel>

        {/* Download button - only for files */}
        <AriaLabel label={canDownload ? 'Download' : 'Download (files only)'}>
          <button
            onClick={() => canDownload && handleDownloadFiles(selectedItems)}
            disabled={!canDownload}
            className={`p-2 rounded-full transition-colors ${
              canDownload ? 'hover:bg-accent' : 'opacity-50 cursor-not-allowed'
            }`}
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineDownload size={18} />
          </button>
        </AriaLabel>

        {/* Share button - only for files */}
        <AriaLabel label={canShare ? 'Share' : 'Share (files only)'}>
          <button
            onClick={() => canShare && handleShareFiles(selectedItems)}
            disabled={!canShare}
            className={`p-2 rounded-full transition-colors ${
              canShare ? 'hover:bg-accent' : 'opacity-50 cursor-not-allowed'
            }`}
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineShare size={18} />
          </button>
        </AriaLabel>

        {/* Delete button - works for both files and folders */}
        <AriaLabel label="Delete">
          <button
            onClick={() => canDelete && handleDeleteItems(selectedItems)}
            disabled={!canDelete}
            className={`p-2 rounded-full transition-colors ${
              canDelete ? 'hover:bg-accent' : 'opacity-50 cursor-not-allowed'
            }`}
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineTrash size={18} />
          </button>
        </AriaLabel>
      </div>
    </div>
  );
}
