'use client';

import { Folder } from '@/features/dashboard/types/folder';
import type React from 'react';
import { useState, useEffect } from 'react';
import { FolderItem } from '../../ui';
import { FolderDropTarget } from '@/features/upload/components/folder-drop-target';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';

interface SuggestedFoldersProps {
  folders: Folder[];
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onViewMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  className?: string;
  hideTitle?: boolean;
  /**
   * What this section is called.
   *
   * Written for Home and then reused wholesale by My Drive, heading and all,
   * so a bucket's own folders were announced as "Suggested Folders". Nothing
   * in a directory listing is a suggestion. Home keeps the default; the drive
   * views pass their own plain label.
   */
  title?: string;
  /**
   * Rendered at the right of this section's heading.
   *
   * The layout toggle lives here in grid view. It used to sit in the file
   * table's heading in both layouts, and in grid that heading is below the
   * whole folders section - so switching from list to grid dropped the control
   * the length of the folder grid, out from under the pointer that had just
   * clicked it. Whichever section leads the page owns the toggle instead, so it
   * stays put.
   */
  headerAction?: React.ReactNode;
  onFilesDroppedToFolder?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

export const SuggestedFolders: React.FC<SuggestedFoldersProps> = ({
  folders,
  onFolderClick,
  onFolderMenuClick,
  onViewMore,
  hasMore = false,
  isLoadingMore = false,
  className = '',
  hideTitle = false,
  title = 'Suggested Folders',
  headerAction,
  onFilesDroppedToFolder,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { clearSelection } = useMultiSelectStore();

  // Handle ESC key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  if (folders.length === 0) {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      {/* min-h-9 is the height of the heading button, held whether or not there
          is a heading, so the toggle sits at the same y in both layouts. */}
      {!hideTitle && (
        <div className="flex min-h-9 items-center justify-between mb-3">
          <AriaLabel
            label={`${isExpanded ? 'Collapse' : 'Expand'} ${title.toLowerCase()} section`}
            position="top"
          >
            <button
              className="
              flex items-center cursor-pointer gap-2  p-2
              text-sm font-medium text-foreground
              hover:bg-secondary/80 rounded-lg
              transition-all duration-200
            "
              onClick={toggleExpanded}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : 'rotate-0'
                  }`}
                >
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
                <span className="text-muted-foreground">{title}</span>
              </div>
            </button>
          </AriaLabel>

          {headerAction}
        </div>
      )}

      {(hideTitle || isExpanded) && (
        <div
          id="suggested-folders-content"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {folders.map((folder, index) => (
            <FolderDropTarget
              key={folder.Prefix}
              folder={{
                id: folder.Prefix || folder.name,
                name: folder.name,
                path: folder.Prefix || folder.name,
              }}
              onFilesDropped={onFilesDroppedToFolder}
              className="rounded-lg"
            >
              <FolderItem
                folder={folder}
                onClick={onFolderClick}
                onMenuClick={onFolderMenuClick}
                index={index}
                allFolders={folders}
              />
            </FolderDropTarget>
          ))}
        </div>
      )}

      {(hideTitle || isExpanded) && hasMore && (
        <div className="mt-4 text-center">
          <AriaLabel
            label={isLoadingMore ? 'Loading more folders...' : 'Load additional folders to view'}
            position="top"
          >
            <button
              onClick={onViewMore}
              disabled={isLoadingMore}
              className="px-4 py-2 text-sm cursor-pointer font-medium text-primary hover:bg-primary/20  hover:rounded-2xl  duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore ? 'Loading...' : 'View More Folders'}
            </button>
          </AriaLabel>
        </div>
      )}
    </div>
  );
};
