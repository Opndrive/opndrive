import { useState } from 'react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { HiOutlineDotsVertical } from 'react-icons/hi';
import { FaUserAlt } from 'react-icons/fa';
import { FileThumbnailWithImage } from './file-thumbnail-with-image';
import { FileExtension, FileItem } from '@/features/dashboard/types/file';
import { FileOverflowMenu } from '../menus/file-overflow-menu';
import { formatTimeWithTooltip } from '@/shared/utils/time-utils';
import { useFilePreviewActions } from '@/hooks/use-file-preview-actions';

interface FileItemGridProps {
  file: FileItem;
  allFiles?: FileItem[]; // For navigation between files
  _onAction?: (action: string, file: FileItem) => void;
}

export function FileItemGrid({ file, allFiles = [], _onAction }: FileItemGridProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { openFilePreview } = useFilePreviewActions();

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
    // Only open preview for non-folder items
    if (!file.Key?.endsWith('/')) {
      openFilePreview(file, allFiles);
    }
  };

  const timeInfo = formatTimeWithTooltip(file.lastModified);

  return (
    <div
      className="group relative rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors cursor-pointer"
      onDoubleClick={handleFileClick}
    >
      <FileThumbnailWithImage
        extension={file.extension as FileExtension}
        name={file.name}
        file={file}
      />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileIcon
              extension={file.extension as FileExtension}
              className="h-4 w-4 flex-shrink-0"
            />
            <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
          </div>

          <button
            className="p-1 rounded-full hover:bg-secondary/80 transition-colors"
            onClick={handleMenuClick}
          >
            <HiOutlineDotsVertical size={18} className=" text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-card-foreground/70 flex items-center justify-center">
                  <FaUserAlt size={12} className="text-background" />
                </div>
                <span className="text-sm text-muted-foreground truncate">{'me'}</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground truncate" title={timeInfo.tooltip}>
              {timeInfo.display}
            </span>
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
