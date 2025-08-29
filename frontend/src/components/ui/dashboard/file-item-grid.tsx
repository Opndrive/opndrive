// import { Users } from 'lucide-react';
import { useState } from 'react';
import type { FileItem, FileExtension } from '@/types/dashboard/file';
import { FileThumbnail } from '@/components/ui/dashboard/file-thumbnail';
import { FileIcon } from '@/components/icons/file-icons';
import { FileOverflowMenu } from '@/components/ui/dashboard/file-overflow-menu';
import { HiOutlineDotsVertical } from 'react-icons/hi';
import { FaUserAlt } from 'react-icons/fa';

interface FileItemGridProps {
  file: FileItem;
  _onAction?: (action: string, file: FileItem) => void;
}

export function FileItemGrid({ file, _onAction }: FileItemGridProps) {
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
    <div className="group relative rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
      {/* File Thumbnail */}
      <FileThumbnail extension={file.extension as FileExtension} _name={file.name} />

      {/* File Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileIcon
              extension={file.extension as FileExtension}
              className="h-4 w-4 flex-shrink-0"
            />
            <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
            {/* {file.isShared && <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />} */}
          </div>

          {/* Overflow Menu */}
          <button
            className="p-1 rounded-full hover:bg-secondary/80 transition-colors"
            onClick={handleMenuClick}
          >
            <HiOutlineDotsVertical size={18} className=" text-muted-foreground" />
          </button>
        </div>

        {/* File Metadata */}
        <div className="space-y-1">
          {/* <p className="text-xs text-muted-foreground">{file.reasonSuggested}</p> */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="hidden lg:flex items-center gap-2 col-span-2">
                <div className="h-6 w-6 rounded-full bg-card-foreground/70 flex items-center justify-center">
                  <FaUserAlt size={12} className="text-background" />
                </div>
                <span className="text-sm text-muted-foreground truncate">{'me'}</span>
              </div>
            </div>
          </div>
        </div>
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
