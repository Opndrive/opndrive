'use client';

import type React from 'react';
import { useState } from 'react';
import { FolderIcon, MoreVerticalIcon } from '@/shared/components/icons/folder-icons';
import { HiOutlineCheck } from 'react-icons/hi';
import { FaRegCircle } from 'react-icons/fa';
import { FolderOverflowMenu } from '../menus/folder-overflow-menu';
import { Folder, FolderMenuAction } from '@/features/dashboard/types/folder';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { getItemKeyIntent, opensMenuOnKey } from './item-keyboard';

interface FolderItemProps {
  folder: Folder;
  onClick?: (folder: Folder) => void;
  onMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  className?: string;
  index?: number; // For shift-select range
  allFolders?: Folder[]; // For range selection
  additionalActions?: FolderMenuAction[]; // Additional menu actions
  insertAdditionalActionsAfter?: string; // Where to insert additional actions
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
  additionalActions,
  insertAdditionalActionsAfter,
}) => {
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const intent = getItemKeyIntent(event);
    if (!intent) return;

    // Space would scroll the page otherwise
    event.preventDefault();

    if (intent === 'select') {
      selectItem(
        folder,
        'folder',
        index,
        event.ctrlKey || event.metaKey,
        event.shiftKey,
        allFolders
      );
      return;
    }

    onClick?.(folder);
  };

  /**
   * Selecting runs on pointer down rather than click, because that is when the
   * menu itself opens: Radix's trigger calls onOpenToggle from onPointerDown.
   * Selecting on click left the multi-select bar trailing the menu by the whole
   * length of the press - the menu was already unfolding while the row was
   * still unselected.
   *
   * Not on touch. There a tap opens an item and selection sits behind a long
   * press, and once anything is selected a tap selects instead of opening - so
   * selecting here would quietly change what every later tap does.
   */
  const handleMenuPointerDown = (event: React.PointerEvent) => {
    // The same guard Radix puts on its own trigger. A secondary click, or a
    // macOS ctrl-click, does not open the menu, so it must not select either.
    if (event.button !== 0 || event.ctrlKey) return;

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      selectItem(folder, 'folder', index, false, false, allFolders);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!opensMenuOnKey(event)) return;

    selectItem(folder, 'folder', index, false, false, allFolders);
  };

  const handleMenuClick = (event: React.MouseEvent) => {
    // Still load-bearing after the selection moved off it: the row opens the
    // item on click, so the click that opened the menu must not reach it.
    event.stopPropagation();
    onMenuClick?.(folder, event);
  };

  const timeInfo = formatTimeWithTooltip(folder.lastModified);

  return (
    <>
      <div
        data-folder-item
        role="button"
        tabIndex={0}
        aria-label={`${folder.name}, folder${selected ? ', selected' : ''}`}
        className={`
          group flex items-center gap-3 p-3 rounded-lg
          transition-all duration-200 cursor-pointer select-none
          bg-secondary
          hover:bg-secondary/80
          focus-visible:ring-2 focus-visible:ring-primary
          ${className}
        `}
        style={{
          outline: selected ? '2px solid var(--primary)' : 'none',
          background: selected ? 'var(--accent)' : undefined,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
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

        <FolderOverflowMenu
          folder={folder}
          triggerLabel="More actions"
          additionalActions={additionalActions}
          insertAdditionalActionsAfter={insertAdditionalActionsAfter}
          trigger={
            <button
              className="
                flex-shrink-0 p-1 rounded-full cursor-pointer
                hover:bg-accent transition-all duration-200
                text-muted-foreground hover:text-foreground
              "
              aria-label={`More actions for ${folder.name}`}
              onPointerDown={handleMenuPointerDown}
              onKeyDown={handleMenuKeyDown}
              onClick={handleMenuClick}
            >
              <MoreVerticalIcon size={16} />
            </button>
          }
        />
      </div>
    </>
  );
};
