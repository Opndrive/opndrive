import { useState } from 'react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { HiOutlineDotsVertical, HiOutlineCheck } from 'react-icons/hi';
import { FaUserAlt, FaRegCircle } from 'react-icons/fa';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { FileExtension, FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { formatTimeWithTooltip, NO_DATE } from '@/shared/utils/time-utils';
import { useFilePreviewActions } from '@/hooks/use-file-preview-actions';
import { getEffectiveExtension } from '@/config/file-extensions';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { getItemKeyIntent } from './item-keyboard';

interface FileItemListProps {
  file: FileItem;
  /**
   * The rows a shift-select range can span. Widened to include folders: in list
   * view they share one table with the files, so a range from a folder into the
   * files below has to be sliceable out of a single array.
   */
  allFiles?: (FileItem | Folder)[];
  _onAction?: (action: string, file: FileItem) => void;
  index?: number; // For shift-select range
  additionalActions?: FileMenuAction[]; // Additional menu actions
  insertAdditionalActionsAfter?: string; // Where to insert additional actions
}

export function FileItemList({
  file,
  allFiles = [],
  _onAction,
  index = 0,
  additionalActions,
  insertAdditionalActionsAfter,
}: FileItemListProps) {
  const { openFilePreview } = useFilePreviewActions();
  const { selectItem, isSelected, getSelectionCount } = useMultiSelectStore();

  /**
   * The neighbours the preview can arrow through.
   *
   * `allFiles` carries the folders too now, because shift-select ranges span
   * the whole table - but a folder has nothing to preview, so it is dropped
   * here rather than handed to a viewer that would not know what to do with it.
   */
  const previewableFiles = allFiles.filter(
    (item): item is FileItem => !('Prefix' in item && Boolean(item.Prefix))
  );

  const selected = isSelected(file);
  const hasSelection = getSelectionCount() > 0;

  // Long press detection for mobile
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);

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
      selectItem(file, 'file', index, false, false, allFiles);
    }
  };

  /**
   * The keyboard's way in.
   *
   * Radix opens the menu from onKeyDown and calls preventDefault, which stops
   * the browser synthesising the click the mouse path selects on - so tabbing
   * to the button and pressing Enter opened a menu over an unselected row, and
   * the toolbar never appeared to say what it would act on. Same keys Radix
   * itself opens on.
   */
  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown') return;

    selectItem(file, 'file', index, false, false, allFiles);
  };

  const handleMenuClick = (event: React.MouseEvent) => {
    // Still load-bearing after the selection moved off it: the row opens the
    // item on click, so the click that opened the menu must not reach it.
    event.stopPropagation();
  };

  const handleTouchStart = () => {
    setIsLongPress(false);
    const timer = setTimeout(() => {
      setIsLongPress(true);
      // Trigger selection on long press - start selection mode with ctrlKey=true to toggle/add
      selectItem(file, 'file', index, true, false, allFiles); // true = toggle/add to selection
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

  const handleFileClick = (event: React.MouseEvent) => {
    // On mobile (touch devices), use different logic
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
      // Mobile: If there's a selection, add to it (toggle like Ctrl+Click)
      if (hasSelection) {
        event.preventDefault();
        event.stopPropagation();
        selectItem(file, 'file', index, true, false, allFiles); // true = toggle/add to selection
        setIsLongPress(false);
        return; // Stop here, don't open file
      }

      // If this was a long press, don't open file
      if (isLongPress) {
        event.preventDefault();
        event.stopPropagation();
        setIsLongPress(false);
        return;
      }

      // No selection and not a long press - open file
      if (!file.Key?.endsWith('/')) {
        openFilePreview(file, previewableFiles);
      }
      setIsLongPress(false);
    } else {
      // Desktop: Single click to select
      selectItem(file, 'file', index, event.ctrlKey || event.metaKey, event.shiftKey, allFiles);
    }
  };

  const handleDoubleClick = () => {
    // Only open preview for non-folder items on double click (desktop only)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice && !file.Key?.endsWith('/')) {
      openFilePreview(file, previewableFiles);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const intent = getItemKeyIntent(event);
    if (!intent) return;

    // Space would scroll the page otherwise
    event.preventDefault();

    if (intent === 'select') {
      selectItem(file, 'file', index, event.ctrlKey || event.metaKey, event.shiftKey, allFiles);
      return;
    }

    if (!file.Key?.endsWith('/')) {
      openFilePreview(file, previewableFiles);
    }
  };

  const timeInfo = formatTimeWithTooltip(file.lastModified);

  return (
    <div
      data-file-item
      className="group relative select-none"
      style={{
        background: selected ? 'var(--accent)' : undefined,
      }}
    >
      {/* Responsive Grid Layout */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${file.name}, file${selected ? ', selected' : ''}`}
        className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-3 hover:bg-secondary/50 transition-all cursor-pointer items-center min-h-[56px] sm:min-h-[64px] focus-visible:ring-2 focus-visible:ring-primary"
        style={{
          borderLeft: selected ? '3px solid var(--primary)' : '3px solid transparent',
        }}
        onClick={handleFileClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Selection indicator + File icon and name */}
        <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4 flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Selection checkbox - show circle when selection mode is active */}
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

          {(() => {
            const { extension, filename } = getEffectiveExtension(file.name, file.extension);
            return (
              <FileIcon
                extension={extension as FileExtension}
                filename={filename}
                className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 flex-shrink-0"
              />
            );
          })()}
          <span className="text-xs sm:text-sm lg:text-base font-medium text-foreground truncate">
            {file.name}
          </span>
        </div>

        {/* Last modified - visible from sm up */}
        <div className="hidden sm:block sm:col-span-2 md:col-span-2 lg:col-span-3 xl:col-span-3">
          <span className="text-xs sm:text-sm text-muted-foreground" title={timeInfo.tooltip}>
            {timeInfo.display || NO_DATE}
          </span>
        </div>

        {/* Owner - visible from lg up */}
        <div className="hidden lg:flex items-center gap-2 lg:col-span-2 xl:col-span-2">
          <div className="h-4 w-4 lg:h-5 lg:w-5 rounded-full bg-card-foreground/70 flex items-center justify-center">
            <FaUserAlt size={10} className="lg:text-[12px] text-background" />
          </div>
          <span className="text-xs lg:text-sm text-muted-foreground truncate">me</span>
        </div>

        {/* File size - visible from xl up */}
        <div className="hidden xl:flex items-center xl:col-span-2">
          <span className="text-sm text-muted-foreground">
            {file.size.value} {file.size.unit}
          </span>
        </div>

        {/* Menu button - always visible */}
        <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1 flex justify-end">
          <FileOverflowMenu
            file={file}
            allFiles={previewableFiles}
            additionalActions={additionalActions}
            insertAdditionalActionsAfter={insertAdditionalActionsAfter}
            triggerLabel="More actions"
            trigger={
              <button
                className="p-1.5 sm:p-2 rounded-full cursor-pointer hover:bg-secondary/80 transition-colors"
                aria-label={`More actions for ${file.name}`}
                onPointerDown={handleMenuPointerDown}
                onKeyDown={handleMenuKeyDown}
                onClick={handleMenuClick}
              >
                <HiOutlineDotsVertical
                  size={16}
                  className="sm:w-[18px] sm:h-[18px] text-muted-foreground"
                />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
