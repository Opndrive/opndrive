import { useState } from 'react';
import { FolderIcon } from '@/shared/components/icons/folder-icons';
import { HiOutlineDotsVertical } from 'react-icons/hi';
import { FolderOverflowMenu } from '../menus/folder-overflow-menu';
import { Folder } from '@/features/dashboard/types/folder';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';

interface FolderItemMobileProps {
  folder: Folder;
  onFolderClick?: (folder: Folder) => void;
  _onAction?: (action: string, folder: Folder) => void;
}

export function FolderItemMobile({ folder, onFolderClick, _onAction }: FolderItemMobileProps) {
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

  const handleFolderClick = () => {
    onFolderClick?.(folder);
  };

  const timeInfo = formatTimeWithTooltip(folder.lastModified);

  return (
    <div
      className="flex items-center p-4 hover:bg-secondary/50 transition-colors active:bg-secondary/70 cursor-pointer"
      onClick={handleFolderClick}
    >
      {/* Folder Icon */}
      <div className="flex-shrink-0 mr-3">
        <FolderIcon className="h-6 w-6 text-primary" />
      </div>

      {/* Folder Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-foreground truncate mb-1">{folder.name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span title={timeInfo?.tooltip}>{timeInfo?.display || 'No date'}</span>
          {folder.itemCount !== undefined && (
            <>
              <span>•</span>
              <span>{folder.itemCount} items</span>
            </>
          )}
        </div>
      </div>

      {/* Menu Button */}
      <button
        className="flex-shrink-0 p-2 rounded-full hover:bg-secondary/80 transition-colors ml-2"
        onClick={handleMenuClick}
      >
        <HiOutlineDotsVertical size={20} className="text-muted-foreground" />
      </button>

      <FolderOverflowMenu
        folder={folder}
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        anchorElement={menuAnchor}
      />
    </div>
  );
}
