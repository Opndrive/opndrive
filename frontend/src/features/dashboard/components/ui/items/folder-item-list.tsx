'use client';

import type React from 'react';
import { useState } from 'react';
import { FolderIcon, MoreVerticalIcon } from '@/shared/components/icons/folder-icons';
import { HiOutlineCheck } from 'react-icons/hi';
import { FaRegCircle, FaUserAlt } from 'react-icons/fa';
import { FolderOverflowMenu } from '../menus/folder-overflow-menu';
import { Folder, FolderMenuAction } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { getItemKeyIntent, opensMenuOnKey } from './item-keyboard';

/**
 * A folder as a row in the drive table.
 *
 * Folders only ever existed as cards, which is why the list view had to show
 * them in a separate block above the file table - two lists, two headers, one
 * folder. This renders a folder into the same column grid a file row uses, so
 * the two can share one table and one sort.
 *
 * Deliberately its own component rather than a mode on `FolderItem`: the
 * codebase already splits rows per layout, and a card and a table row share
 * almost no markup. What they do share is the handler set, which is copied the
 * way the other four row components copy it - `item-menu-selection.test.tsx`
 * covers all of them precisely because drift is how that regresses.
 */

interface FolderItemListProps {
  folder: Folder;
  onClick?: (folder: Folder) => void;
  onMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  className?: string;
  /** Position in the combined folders-then-files list, for shift-select. */
  index?: number;
  /** The combined list, so a range can run from a folder into the files. */
  allItems?: (Folder | FileItem)[];
  additionalActions?: FolderMenuAction[];
  insertAdditionalActionsAfter?: string;
}

export const FolderItemList: React.FC<FolderItemListProps> = ({
  folder,
  onClick,
  onMenuClick,
  className = '',
  index = 0,
  allItems = [],
  additionalActions,
  insertAdditionalActionsAfter,
}) => {
  const { selectItem, isSelected, getSelectionCount } = useMultiSelectStore();

  const selected = isSelected(folder);
  const hasSelection = getSelectionCount() > 0;
  const timeInfo = formatTimeWithTooltip(folder.lastModified);

  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);

  const handleTouchStart = () => {
    setIsLongPress(false);
    const timer = setTimeout(() => {
      setIsLongPress(true);
      selectItem(folder, 'folder', index, true, false, allItems);
      try {
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      } catch (e) {
        console.error('Vibration error:', e);
      }
    }, 500);
    setPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  const handleClick = (event: React.MouseEvent) => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
      if (hasSelection) {
        event.preventDefault();
        event.stopPropagation();
        selectItem(folder, 'folder', index, true, false, allItems);
        setIsLongPress(false);
        return;
      }

      if (isLongPress) {
        event.preventDefault();
        event.stopPropagation();
        setIsLongPress(false);
        return;
      }

      onClick?.(folder);
      setIsLongPress(false);
    } else {
      selectItem(folder, 'folder', index, event.ctrlKey || event.metaKey, event.shiftKey, allItems);
    }
  };

  const handleDoubleClick = () => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      onClick?.(folder);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const intent = getItemKeyIntent(event);
    if (!intent) return;

    event.preventDefault();

    if (intent === 'select') {
      selectItem(folder, 'folder', index, event.ctrlKey || event.metaKey, event.shiftKey, allItems);
      return;
    }

    onClick?.(folder);
  };

  /**
   * Selecting runs on pointer down rather than click, because that is when the
   * menu itself opens: Radix's trigger calls onOpenToggle from onPointerDown.
   */
  const handleMenuPointerDown = (event: React.PointerEvent) => {
    // The same guard Radix puts on its own trigger.
    if (event.button !== 0 || event.ctrlKey) return;

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) {
      selectItem(folder, 'folder', index, false, false, allItems);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!opensMenuOnKey(event)) return;

    selectItem(folder, 'folder', index, false, false, allItems);
  };

  const handleMenuClick = (event: React.MouseEvent) => {
    // The row opens the folder on click, so the click that opened the menu must
    // not reach it.
    event.stopPropagation();
    onMenuClick?.(folder, event);
  };

  return (
    <div className={`group relative select-none ${className}`}>
      <div
        role="button"
        tabIndex={0}
        data-folder-item
        aria-label={`${folder.name}, folder${selected ? ', selected' : ''}`}
        className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-3 hover:bg-secondary/50 transition-all cursor-pointer items-center min-h-[56px] sm:min-h-[64px] focus-visible:ring-2 focus-visible:ring-primary"
        style={{
          borderLeft: selected ? '3px solid var(--primary)' : '3px solid transparent',
          background: selected ? 'var(--accent)' : undefined,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4 flex items-center gap-2 sm:gap-3 min-w-0">
          {hasSelection &&
            (selected ? (
              <div
                className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <HiOutlineCheck size={14} />
              </div>
            ) : (
              <FaRegCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            ))}

          <FolderIcon className="text-blue-400 flex-shrink-0" size={20} />
          <span className="text-xs sm:text-sm lg:text-base font-medium text-foreground truncate">
            {folder.name}
          </span>
        </div>

        <div className="hidden sm:block sm:col-span-2 md:col-span-2 lg:col-span-3 xl:col-span-3">
          <span className="text-xs sm:text-sm text-muted-foreground" title={timeInfo.tooltip}>
            {timeInfo.display}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2 lg:col-span-2 xl:col-span-2">
          <div className="h-4 w-4 lg:h-5 lg:w-5 rounded-full bg-card-foreground/70 flex items-center justify-center">
            <FaUserAlt size={10} className="lg:text-[12px] text-background" />
          </div>
          <span className="text-xs lg:text-sm text-muted-foreground truncate">me</span>
        </div>

        {/* A folder has no size of its own. S3 reports none, and totalling the
            objects beneath it would cost a LIST per row, so an em dash says
            "not applicable" where a 0 B would be a lie. */}
        <div className="hidden xl:flex items-center xl:col-span-2">
          <span className="text-sm text-muted-foreground">&mdash;</span>
        </div>

        <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1 flex justify-end">
          <FolderOverflowMenu
            folder={folder}
            additionalActions={additionalActions}
            insertAdditionalActionsAfter={insertAdditionalActionsAfter}
            triggerLabel="More actions"
            trigger={
              <button
                className="p-1.5 sm:p-2 rounded-full cursor-pointer hover:bg-secondary/80 transition-colors"
                aria-label={`More actions for ${folder.name}`}
                onPointerDown={handleMenuPointerDown}
                onKeyDown={handleMenuKeyDown}
                onClick={handleMenuClick}
              >
                <MoreVerticalIcon size={16} className="text-muted-foreground" />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
};
