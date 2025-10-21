'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMultiSelectStore } from '../../stores/use-multi-select-store';
import {
  HiOutlineX,
  HiOutlineShare,
  HiOutlineDownload,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineDotsVertical,
} from 'react-icons/hi';
import { FolderOpen } from 'lucide-react';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useMultiSelectActions } from '../../hooks/use-multi-select-actions';
import { FileItem } from '../../types/file';
import { Folder } from '../../types/folder';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';

interface MultiSelectToolbarProps {
  openMultiShareDialog: (files: FileItem[]) => void;
  onDeleteSuccess?: () => void;
  showLocationActions?: boolean; // Show "Show in folder" for items from different locations
}

interface MoreAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  disabled?: boolean;
}

export function MultiSelectToolbar({
  openMultiShareDialog,
  onDeleteSuccess,
  showLocationActions = false,
}: MultiSelectToolbarProps) {
  const router = useRouter();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<HTMLElement | null>(null);
  const { selectedItems, selectedType, clearSelection, getSelectionCount } = useMultiSelectStore();
  const {
    handleOpenFiles,
    handleDownloadFiles,
    handleShareFiles,
    handleDeleteItems: baseHandleDeleteItems,
  } = useMultiSelectActions({ openMultiShareDialog });

  const handleDeleteItems = async (items: (FileItem | Folder)[]) => {
    await baseHandleDeleteItems(items);
    onDeleteSuccess?.();
  };

  // Helper to get parent folder path for files or the folder path itself for folders
  const getLocationPath = useCallback((item: FileItem | Folder): string => {
    if ('Prefix' in item && item.Prefix) {
      // It's a folder - keep the Prefix as-is with trailing slash for S3 compatibility
      return item.Prefix;
    } else if ('Key' in item && item.Key) {
      // It's a file - navigate to the parent folder containing the file
      const key = item.Key;
      const pathParts = key.split('/').filter(Boolean);
      pathParts.pop(); // Remove filename
      // Add trailing slash for S3 folder listing compatibility
      const parentPath = pathParts.join('/');
      return parentPath ? `${parentPath}/` : '';
    }
    return '';
  }, []);

  // Show in folder for single selection
  const handleShowInFolder = useCallback(() => {
    if (selectedItems.length !== 1) return;

    const item = selectedItems[0];
    const locationPath = getLocationPath(item);

    if (locationPath) {
      const folderUrl = generateFolderUrl({ prefix: locationPath });
      router.push(folderUrl);
      clearSelection();
    }
  }, [selectedItems, getLocationPath, router, clearSelection]);

  const count = getSelectionCount();

  // Determine what actions are available based on selection
  const hasFiles = selectedItems.some(
    (item) => 'Key' in item && item.Key && !item.Key.endsWith('/')
  );

  const isFilesOnly = selectedType === 'file';
  const isSingleSelection = count === 1;

  // Action availability
  const canOpen = isFilesOnly && hasFiles; // Only files can be opened
  const canDownload = isFilesOnly && hasFiles; // Only files can be downloaded (no folders)
  const canShare = isFilesOnly && hasFiles; // Only files can be shared
  const canDelete = count > 0; // Both files and folders can be deleted
  const canShowInFolder = showLocationActions && isSingleSelection; // Only for single item in search

  // More menu actions
  const moreActions: MoreAction[] = [];

  if (canShowInFolder) {
    const item = selectedItems[0];
    const locationPath = getLocationPath(item);

    moreActions.push({
      id: 'show-in-folder',
      label: 'Show in folder',
      icon: FolderOpen,
      onClick: handleShowInFolder,
      disabled: !locationPath,
    });
  }

  const hasMoreActions = moreActions.length > 0;

  const handleMoreMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMoreMenuAnchor(event.currentTarget as HTMLElement);
    setIsMoreMenuOpen(true);
  };

  const handleMoreMenuClose = () => {
    setIsMoreMenuOpen(false);
    setMoreMenuAnchor(null);
  };

  const handleMoreActionClick = (action: MoreAction) => {
    if (!action.disabled) {
      action.onClick();
      handleMoreMenuClose();
    }
  };

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

        {/* More menu - for additional actions */}
        {hasMoreActions && (
          <div className="relative">
            <AriaLabel label="More actions">
              <button
                onClick={handleMoreMenuClick}
                className="p-2 rounded-full transition-colors hover:bg-accent"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <HiOutlineDotsVertical size={18} />
              </button>
            </AriaLabel>

            {/* Custom dropdown menu */}
            {isMoreMenuOpen && moreMenuAnchor && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={handleMoreMenuClose}
                  aria-hidden="true"
                />

                {/* Dropdown */}
                <div className="absolute right-0 mt-1 w-48 rounded-lg shadow-lg z-50 overflow-hidden p-2 bg-secondary border border-border">
                  {moreActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => handleMoreActionClick(action)}
                        disabled={action.disabled}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-left ${
                          action.disabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-card cursor-pointer'
                        }`}
                        style={{
                          color: 'var(--foreground)',
                        }}
                      >
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
