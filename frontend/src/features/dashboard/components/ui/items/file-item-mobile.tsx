import { useState } from 'react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { HiOutlineDotsVertical, HiOutlineCheck } from 'react-icons/hi';
import { FaRegCircle } from 'react-icons/fa';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { FileExtension, FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { getEffectiveExtension, getFileExtensionWithoutDot } from '@/config/file-extensions';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { useFilePreview } from '@/context/file-preview-context';

interface FileItemMobileProps {
  file: FileItem;
  allFiles?: FileItem[]; // For navigation between files
  onFileClick?: (file: FileItem) => void;
  _onAction?: (action: string, file: FileItem) => void;
  index?: number; // For shift-select range
  additionalActions?: FileMenuAction[]; // Additional menu actions
  insertAdditionalActionsAfter?: string; // Where to insert additional actions
}

export function FileItemMobile({
  file,
  allFiles = [],
  onFileClick: _onFileClick,
  _onAction,
  index = 0,
  additionalActions,
  insertAdditionalActionsAfter,
}: FileItemMobileProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { openPreview } = useFilePreview();
  const { selectItem, isSelected, getSelectionCount } = useMultiSelectStore();

  const selected = isSelected(file);
  const hasSelection = getSelectionCount() > 0;

  // Long press detection
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);

  const handleMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget as HTMLElement);
    setIsMenuOpen(true);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
    setMenuAnchor(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    setIsLongPress(false);

    const timer = setTimeout(() => {
      setIsLongPress(true);
      // Trigger selection on long press
      selectItem(file, 'file', index, true, false, allFiles);
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

  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel long press if finger moves too much
    if (touchStartPos && pressTimer) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPos.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.y);

      // If moved more than 10px, cancel long press
      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(pressTimer);
        setPressTimer(null);
        setIsLongPress(false);
      }
    }
  };

  const handleTouchEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
    setTouchStartPos(null);
  };

  const handleItemClick = () => {
    // Get fresh selection count at click time, not from render-time closure
    const currentSelectionCount = getSelectionCount();
    const hasCurrentSelection = currentSelectionCount > 0;

    // If there's already a selection, add to it (like Ctrl+Click for multi-select)
    if (hasCurrentSelection) {
      // Use ctrlKey=true to add to selection (or toggle if already selected)
      selectItem(file, 'file', index, true, false, allFiles);
      setIsLongPress(false);
      return;
    }

    // If this was a long press, don't open file
    if (isLongPress) {
      setIsLongPress(false);
      return;
    }

    // Normal tap - open the file using the same logic as overflow menu "Open"
    handleFileOpen();
  };

  const handleFileOpen = () => {
    // Use the same preview logic as the overflow menu's "Open" action
    const previewableFile = {
      id: file.id,
      name: file.name,
      key: file.Key,
      size: typeof file.Size === 'number' ? file.Size : 0,
      lastModified: file.lastModified,
      type: file.extension || getFileExtensionWithoutDot(file.name),
    };

    const previewableFiles = allFiles.map((f) => ({
      id: f.id,
      name: f.name,
      key: f.Key,
      size: typeof f.Size === 'number' ? f.Size : 0,
      lastModified: f.lastModified,
      type: f.extension || getFileExtensionWithoutDot(f.name),
    }));

    openPreview(
      previewableFile,
      previewableFiles.length > 0 ? previewableFiles : [previewableFile]
    );
  };

  const timeInfo = formatTimeWithTooltip(file.lastModified);

  return (
    <div
      data-file-item
      className={`flex items-center p-4 transition-colors cursor-pointer select-none touch-manipulation ${
        selected
          ? 'bg-primary/10 hover:bg-primary/15 active:bg-primary/20'
          : 'hover:bg-secondary/50 active:bg-secondary/70'
      }`}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      onClick={handleItemClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Selection Indicator - Show circle when selection mode is active */}
      {hasSelection && (
        <div className="flex-shrink-0 mr-2">
          {selected ? (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <HiOutlineCheck className="w-3 h-3 text-primary-foreground" />
            </div>
          ) : (
            <FaRegCircle className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      )}

      {/* File Icon */}
      <div className="flex-shrink-0 mr-3">
        {(() => {
          const { extension, filename } = getEffectiveExtension(file.name, file.extension);
          return (
            <FileIcon
              extension={extension as FileExtension}
              filename={filename}
              className="h-6 w-6"
            />
          );
        })()}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-foreground truncate mb-1">{file.name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span title={timeInfo.tooltip}>{timeInfo.display}</span>
          <span>•</span>
          <span>
            {file.size.value} {file.size.unit}
          </span>
        </div>
      </div>

      {/* Menu Button */}
      <AriaLabel label={`More actions`} position="top">
        <button
          className="flex-shrink-0 p-2 cursor-pointer rounded-full hover:bg-secondary/80 transition-colors ml-2"
          onClick={handleMenuClick}
        >
          <HiOutlineDotsVertical size={20} className="text-muted-foreground" />
        </button>
      </AriaLabel>

      <FileOverflowMenu
        file={file}
        allFiles={allFiles}
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        anchorElement={menuAnchor}
        additionalActions={additionalActions}
        insertAdditionalActionsAfter={insertAdditionalActionsAfter}
      />
    </div>
  );
}
