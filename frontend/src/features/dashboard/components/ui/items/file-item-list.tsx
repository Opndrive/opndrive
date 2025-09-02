import { useState } from 'react';
import { FileIcon } from '@/components/icons/file-icons';
import { HiOutlineDotsVertical } from 'react-icons/hi';
import { FaUserAlt } from 'react-icons/fa';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { FileExtension, FileItem } from '@/features/dashboard/types/file';

interface FileItemListProps {
  file: FileItem;
  _onAction?: (action: string, file: FileItem) => void;
}

export function FileItemList({ file, _onAction }: FileItemListProps) {
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

  return (
    <div className="group grid grid-cols-12 gap-4 px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-b-0">
      {/* Name Column */}
      <div className="col-span-4 flex items-center gap-3 min-w-0">
        <FileIcon extension={file.extension as FileExtension} className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
      </div>

      {/* Last Updated Column */}
      <div className="hidden md:block col-span-3">
        {' '}
        {file.LastModified?.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </div>

      {/* Owner Column */}
      <div className="hidden lg:flex items-center gap-2 col-span-2">
        <div className="h-6 w-6 rounded-full bg-card-foreground/70 flex items-center justify-center">
          <FaUserAlt size={12} className="text-background" />
        </div>
        <span className="text-sm text-muted-foreground truncate">{'me'}</span>
      </div>

      {/* Size Column */}
      <div className="hidden xl:flex items-center gap-2 col-span-2">
        {file.size.value} {file.size.unit}
      </div>

      {/* Actions */}
      <div className="col-span-1 flex justify-end">
        <button
          className="p-1 rounded-full hover:bg-secondary/80 transition-colors"
          onClick={handleMenuClick}
        >
          <HiOutlineDotsVertical size={18} className="text-muted-foreground" />
        </button>
      </div>

      <FileOverflowMenu
        file={file}
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        anchorElement={menuAnchor}
      />
    </div>
  );
}
