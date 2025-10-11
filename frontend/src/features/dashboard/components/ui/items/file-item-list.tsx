import { useState } from 'react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { HiOutlineDotsVertical, HiOutlineCheck } from 'react-icons/hi';
import { FaUserAlt } from 'react-icons/fa';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { FileExtension, FileItem } from '@/features/dashboard/types/file';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { useFilePreviewActions } from '@/hooks/use-file-preview-actions';
import { getEffectiveExtension } from '@/config/file-extensions';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';

interface FileItemListProps {
  file: FileItem;
  allFiles?: FileItem[]; // For navigation between files
  _onAction?: (action: string, file: FileItem) => void;
  index?: number; // For shift-select range
}

export function FileItemList({ file, allFiles = [], _onAction, index = 0 }: FileItemListProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { openFilePreview } = useFilePreviewActions();
  const { selectItem, isSelected } = useMultiSelectStore();

  const selected = isSelected(file);

  const handleMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget as HTMLElement);
    setIsMenuOpen(true);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
    setMenuAnchor(null);
  };

  const handleFileClick = (event: React.MouseEvent) => {
    // Handle selection on single click
    selectItem(file, 'file', index, event.ctrlKey || event.metaKey, event.shiftKey, allFiles);
  };

  const handleDoubleClick = () => {
    // Only open preview for non-folder items on double click
    if (!file.Key?.endsWith('/')) {
      openFilePreview(file, allFiles);
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
        className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-3 hover:bg-secondary/50 transition-all cursor-pointer items-center min-h-[56px] sm:min-h-[64px]"
        style={{
          borderLeft: selected ? '3px solid var(--primary)' : '3px solid transparent',
        }}
        onClick={handleFileClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Selection indicator + File icon and name */}
        <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4 flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Selection checkbox */}
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
            {timeInfo.display}
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
          <AriaLabel label={`More actions`} position="top">
            <button
              className="p-1.5 sm:p-2 rounded-full cursor-pointer hover:bg-secondary/80 transition-colors"
              onClick={handleMenuClick}
            >
              <HiOutlineDotsVertical
                size={16}
                className="sm:w-[18px] sm:h-[18px] text-muted-foreground"
              />
            </button>
          </AriaLabel>
        </div>
      </div>

      <FileOverflowMenu
        file={file}
        allFiles={allFiles}
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        anchorElement={menuAnchor}
      />
    </div>
  );
}
