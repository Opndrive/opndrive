'use client';

import type React from 'react';
import { useState } from 'react';
import { FolderIcon, MoreVerticalIcon } from '@/shared/components/icons/folder-icons';
import { HiOutlineCheck } from 'react-icons/hi';
import { FaRegCircle } from 'react-icons/fa';
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
  const { selectItem, isSelected, getSelectionCount } = useMultiSelectStore();

  const selected = isSelected(folder);
  const hasSelection = getSelectionCount() > 0;

  // Long press detection for mobile
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);

  const handleTouchStart = () => {
    setIsLongPress(false);
    const timer = setTimeout(() => {
      setIsLongPress(true);
      // Trigger selection on long press - start selection mode with ctrlKey=true to toggle/add
      selectItem(folder, 'folder', index, true, false, allFolders); // true = toggle/add to selection
      // Haptic feedback if available (wrapped in try-catch to avoid console errors)
      try {
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      } catch (e) {
        // Silently ignore vibration errors
        console.error('Vibration error:', e);
      }
    }, 500); // 500ms for long press
    setPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  const handleClick = (event: React.MouseEvent) => {
    // On mobile (touch devices), use different logic
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
      // Mobile: If there's a selection, add to it (toggle like Ctrl+Click)
      if (hasSelection) {
        event.preventDefault();
        event.stopPropagation();
        selectItem(folder, 'folder', index, true, false, allFolders); // true = toggle/add to selection
        setIsLongPress(false);
        return; // Stop here, don't open folder
      }

      // If this was a long press, don't open folder
      if (isLongPress) {
        event.preventDefault();
        event.stopPropagation();
        setIsLongPress(false);
        return;
      }

      // No selection and not a long press - open folder
      onClick?.(folder);
      setIsLongPress(false);
    } else {
      // Desktop: Single click to select
      selectItem(
        folder,
        'folder',
        index,
        event.ctrlKey || event.metaKey,
        event.shiftKey,
        allFolders
      );
    }
  };

  const handleDoubleClick = () => {
    // Navigate to folder on double click (desktop only)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      onClick?.(folder);
    }
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Selection indicator - show circle when selection mode is active */}
        {hasSelection &&
          (selected ? (
            <div
              className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
              style={{
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              <HiOutlineCheck size={14} />
            </div>
          ) : (
            <FaRegCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          ))}

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
