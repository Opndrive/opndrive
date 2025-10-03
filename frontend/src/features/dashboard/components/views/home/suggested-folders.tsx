'use client';

import { Folder } from '@/features/dashboard/types/folder';
import type React from 'react';
import { useState } from 'react';
import { FolderItem } from '../../ui';
import { FolderDropTarget } from '@/features/upload/components/folder-drop-target';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';

interface SuggestedFoldersProps {
  folders: Folder[];
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onViewMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  className?: string;
  hideTitle?: boolean;
  onFilesDroppedToFolder?: (files: File[], folders: File[], targetFolder: DragDropTarget) => void;
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
  onFilesDroppedToFolder,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  if (folders.length === 0) {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      {!hideTitle && (
        <button
          className="
            flex items-center cursor-pointer gap-2  p-2 mb-3
            text-sm font-medium text-foreground
            hover:bg-secondary/80 rounded-lg
            transition-colors duration-200
          "
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-controls="suggested-folders-content"
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Suggested folders
        </button>
      )}

      {(hideTitle || isExpanded) && (
        <div
          id="suggested-folders-content"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {folders.map((folder) => (
            <FolderDropTarget
              key={folder.Prefix}
              folder={{
                id: folder.Prefix || folder.name,
                name: folder.name,
                path: folder.Prefix || folder.name,
              }}
              onFilesDropped={onFilesDroppedToFolder || (() => {})}
              className="rounded-lg"
            >
              <FolderItem folder={folder} onClick={onFolderClick} onMenuClick={onFolderMenuClick} />
            </FolderDropTarget>
          ))}
        </div>
      )}

      {(hideTitle || isExpanded) && hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={onViewMore}
            disabled={isLoadingMore}
            className="px-4 py-2 text-sm cursor-pointer font-medium text-primary hover:bg-primary/20  hover:rounded-2xl  duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading...' : 'View More Folders'}
          </button>
        </div>
      )}
    </div>
  );
};
