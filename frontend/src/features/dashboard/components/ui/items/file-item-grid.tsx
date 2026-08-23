import { useState } from 'react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { HiOutlineDotsVertical, HiOutlineCheck } from 'react-icons/hi';
import { FaUserAlt, FaRegCircle } from 'react-icons/fa';
import { FileThumbnailWithImage } from './file-thumbnail-with-image';
import { FileExtension, FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { useFilePreviewActions } from '@/hooks/use-file-preview-actions';
import { getEffectiveExtension } from '@/config/file-extensions';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { getItemKeyIntent } from './item-keyboard';

interface FileItemGridProps {
  file: FileItem;
  allFiles?: FileItem[]; // For navigation between files
  _onAction?: (action: string, file: FileItem) => void;
  index?: number; // For shift-select range
  additionalActions?: FileMenuAction[]; // Additional menu actions
  insertAdditionalActionsAfter?: string; // Where to insert additional actions
}

export function FileItemGrid({
  file,
  allFiles = [],
  _onAction,
  index = 0,
  additionalActions,
  insertAdditionalActionsAfter,
}: FileItemGridProps) {
  const { openFilePreview } = useFilePreviewActions();
  const { selectItem, isSelected, getSelectionCount } = useMultiSelectStore();

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
        openFilePreview(file, allFiles);
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
      openFilePreview(file, allFiles);
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
      openFilePreview(file, allFiles);
    }
  };

  const timeInfo = formatTimeWithTooltip(file.lastModified);

  return (
    <div
      data-file-item
      role="button"
      tabIndex={0}
      aria-label={`${file.name}, file${selected ? ', selected' : ''}`}
      className="group relative rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-all cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        outline: selected ? '2px solid var(--primary)' : 'none',
        background: selected ? 'var(--accent)' : undefined,
      }}
      onClick={handleFileClick}
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
            className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            <HiOutlineCheck size={16} />
          </div>
        ) : (
          <div className="absolute top-2 left-2 z-10">
            <FaRegCircle className="w-6 h-6 text-muted-foreground" />
          </div>
        ))}
      <FileThumbnailWithImage
        extension={getEffectiveExtension(file.name, file.extension).extension as FileExtension}
        filename={getEffectiveExtension(file.name, file.extension).filename}
        name={file.name}
        file={file}
      />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {(() => {
              const { extension, filename } = getEffectiveExtension(file.name, file.extension);

              return (
                <FileIcon
                  extension={extension as FileExtension}
                  filename={filename}
                  className="h-4 w-4 flex-shrink-0"
                />
              );
            })()}
            <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
          </div>

          <FileOverflowMenu
            file={file}
            allFiles={allFiles}
            additionalActions={additionalActions}
            insertAdditionalActionsAfter={insertAdditionalActionsAfter}
            triggerLabel="More actions"
            trigger={
              <button
                className="p-1 rounded-full cursor-pointer hover:bg-secondary/80 transition-colors"
                aria-label={`More actions for ${file.name}`}
                onPointerDown={handleMenuPointerDown}
                onKeyDown={handleMenuKeyDown}
                onClick={handleMenuClick}
              >
                <HiOutlineDotsVertical size={18} className=" text-muted-foreground" />
              </button>
            }
          />
        </div>

        <div className="space-y-1">
          {/* Top row: Owner and time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-card-foreground/70 flex items-center justify-center">
                <FaUserAlt size={8} className="text-background" />
              </div>
              <span className="text-xs text-muted-foreground truncate">me</span>
            </div>
            <span className="text-xs text-muted-foreground truncate" title={timeInfo.tooltip}>
              {timeInfo.display}
            </span>
          </div>

          {/* Bottom row: File size - subtle and minimal */}
          <div className="flex justify-center">
            <span className="text-xs text-muted-foreground/70">
              {file.size.value} {file.size.unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
