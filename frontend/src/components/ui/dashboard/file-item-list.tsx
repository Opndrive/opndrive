import { Users } from 'lucide-react';
import { MdFolderShared } from 'react-icons/md';
import { useState } from 'react';
import type { FileItem, FileExtension } from '@/types/dashboard/file';
import { FileIcon } from '@/components/icons/file-icons';
import { FileOverflowMenu } from '@/components/ui/dashboard/file-overflow-menu';
import { FaFolder } from 'react-icons/fa';
import { HiOutlineDotsVertical } from 'react-icons/hi';

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
        {file.isShared && <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
      </div>

      {/* Reason Suggested Column */}
      <div className="hidden md:block col-span-3">
        <span className="text-sm text-muted-foreground">{file.reasonSuggested}</span>
      </div>

      {/* Owner Column */}
      <div className="hidden lg:flex items-center gap-2 col-span-2">
        <div className="h-6 w-6 rounded-full bg-orange-500 flex items-center justify-center">
          <span className="text-xs font-medium text-white">
            {file.owner.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-sm text-muted-foreground truncate">
          {file.owner.name === 'me' ? 'me' : file.owner.name}
        </span>
      </div>

      {/* Location Column */}
      <div className="hidden xl:flex items-center gap-2 col-span-2">
        {file.location.type === 'shared-with-me' ? (
          <MdFolderShared size={18} className="text-muted-foreground" />
        ) : (
          <FaFolder size={18} className="text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground truncate">
          {file.location.type === 'my-drive'
            ? 'My Drive'
            : file.location.type === 'shared-with-me'
              ? 'Shared with me'
              : file.location.path}
        </span>
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
