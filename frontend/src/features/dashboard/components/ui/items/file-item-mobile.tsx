import { useState } from 'react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { HiOutlineDotsVertical } from 'react-icons/hi';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { FileExtension, FileItem } from '@/features/dashboard/types/file';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';

interface FileItemMobileProps {
  file: FileItem;
  onFileClick?: (file: FileItem) => void;
  _onAction?: (action: string, file: FileItem) => void;
}

export function FileItemMobile({ file, onFileClick, _onAction }: FileItemMobileProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const handleMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget as HTMLElement);
    setIsMenuOpen(true);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
    setMenuAnchor(null);
  };

  const handleFileClick = () => {
    onFileClick?.(file);
  };

  const timeInfo = formatTimeWithTooltip(file.lastModified);

  return (
    <div
      className="flex items-center p-4 hover:bg-secondary/50 transition-colors active:bg-secondary/70 cursor-pointer"
      onClick={handleFileClick}
    >
      {/* File Icon */}
      <div className="flex-shrink-0 mr-3">
        <FileIcon extension={file.extension as FileExtension} className="h-6 w-6" />
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
      <button
        className="flex-shrink-0 p-2 rounded-full hover:bg-secondary/80 transition-colors ml-2"
        onClick={handleMenuClick}
      >
        <HiOutlineDotsVertical size={20} className="text-muted-foreground" />
      </button>

      <FileOverflowMenu
        file={file}
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        anchorElement={menuAnchor}
      />
    </div>
  );
}
