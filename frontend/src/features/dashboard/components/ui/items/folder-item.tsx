'use client';

import type React from 'react';
import { useState } from 'react';
import { FolderIcon, MoreVerticalIcon } from '@/shared/components/icons/folder-icons';
import { HiOutlineCheck } from 'react-icons/hi';
import { FolderOverflowMenu } from '../menus/folder-overflow-menu';
import { Folder } from '@/features/dashboard/types/folder';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';

interface FolderItemProps {
  folder: Folder;
  onClick?: (folder: Folder) => void;
  onMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  className?: string;
  index?: number; // For shift-select range
  allFolders?: Folder[]; // For range selection
}

const getFolderIcon = (_folder: Folder) => {
  // if (folder.location.type === 'shared-with-me') {
  //   return <SharedFolderIcon className="text-blue-400" size={20} />;
  // }
  return <FolderIcon className="text-blue-400" size={20} />;
};

export const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  onClick,
  onMenuClick,
  className = '',
  index = 0,
  allFolders = [],
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { selectItem, isSelected } = useMultiSelectStore();

  const selected = isSelected(folder);

  const handleClick = (event: React.MouseEvent) => {
    // Handle selection on single click
    selectItem(folder, 'folder', index, event.ctrlKey || event.metaKey, event.shiftKey, allFolders);
  };

  const handleDoubleClick = () => {
    // Navigate to folder on double click
    onClick?.(folder);
  };

  const handleMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget as HTMLElement);
    setIsMenuOpen(true);
    onMenuClick?.(folder, event);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
    setMenuAnchor(null);
  };

  const timeInfo = formatTimeWithTooltip(folder.lastModified);

  return (
    <>
      <div
        data-folder-item
        className={`
          group flex items-center gap-3 p-3 rounded-lg
          transition-all duration-200 cursor-pointer select-none
          bg-secondary 
          hover:bg-secondary/80
          ${className}
        `}
        style={{
          outline: selected ? '2px solid var(--primary)' : 'none',
          background: selected ? 'var(--accent)' : undefined,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Selection indicator */}
        {selected && (
          <div
            className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            <HiOutlineCheck size={14} />
          </div>
        )}

        <div className="flex-shrink-0">{getFolderIcon(folder)}</div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">{folder.name}</h3>
          {timeInfo.display && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate" title={timeInfo.tooltip}>
              {timeInfo.display}
            </p>
          )}
        </div>

        <AriaLabel label={`More actions`} position="top">
          <button
            className="
              flex-shrink-0 p-1 rounded-full cursor-pointer
              hover:bg-accent transition-all duration-200
              text-muted-foreground hover:text-foreground
            "
            onClick={handleMenuClick}
          >
            <MoreVerticalIcon size={16} />
          </button>
        </AriaLabel>
      </div>

      <FolderOverflowMenu
        folder={folder}
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        anchorElement={menuAnchor}
      />
    </>
  );
};
