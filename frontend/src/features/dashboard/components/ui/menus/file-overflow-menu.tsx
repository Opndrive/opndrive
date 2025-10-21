'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import { Download, Edit3, Info, Trash2, Eye, Share } from 'lucide-react';
import { useDownload } from '@/features/dashboard/hooks/use-download';
import { useDeleteWithProgress } from '@/features/dashboard/hooks/use-delete-with-progress';
import { useRename } from '@/context/rename-context';
import { useDetails } from '@/context/details-context';
import { useFilePreview } from '@/context/file-preview-context';
import { useDriveStore } from '@/context/data-context';
import { useShare } from '@/context/share-context';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';
import { AriaLabel } from '@/shared/components/custom-aria-label';

interface FileOverflowMenuProps {
  file: FileItem;
  allFiles?: FileItem[];
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
}

export const FileOverflowMenu: React.FC<FileOverflowMenuProps> = ({
  file,
  allFiles = [],
  isOpen,
  onClose,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState('top-left');

  const { downloadFile, isDownloading } = useDownload();
  const { isRenaming, showRenameDialog: openRenameDialog } = useRename();
  const { open: openDetails } = useDetails();
  const { openPreview } = useFilePreview();
  const { currentPrefix } = useDriveStore();
  const { openShareDialog } = useShare();
  const { deleteFile, isDeleting } = useDeleteWithProgress();

  const getDefaultFileMenuActions = (file: FileItem): FileMenuAction[] => [
    {
      id: 'open',
      label: 'Open',
      icon: Eye,
      onClick: () => {
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
        onClose();
      },
    },
    {
      id: 'download',
      label: 'Download',
      icon: Download,
      disabled: isDownloading(file.id),
      onClick: (file) => {
        setTimeout(() => downloadFile(file), 0);
        onClose();
      },
    },
    {
      id: 'share',
      label: 'Share',
      icon: Share,
      onClick: () => {
        openShareDialog(file);
        onClose();
      },
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: Edit3,
      disabled: isRenaming(file.id || file.Key || file.name),
      onClick: () => {
        openRenameDialog(file, 'file', currentPrefix || '');
        onClose();
      },
    },
    {
      id: 'info',
      label: 'File information',
      icon: Info,
      onClick: () => {
        openDetails(file);
        onClose();
      },
    },
    {
      id: 'delete',
      label: isDeleting(file.id || file.Key || file.name) ? 'Deleting...' : 'Delete forever',
      icon: Trash2,
      variant: 'destructive' as const,
      disabled: isDeleting(file.id || file.Key || file.name),
      onClick: async () => {
        const confirmDelete = window.confirm(
          `Are you sure you want to delete "${file.name}" forever? This action cannot be undone.`
        );

        if (confirmDelete) {
          try {
            await deleteFile(file);
          } catch (error) {
            console.error('Delete failed:', error);
          }
        }
        onClose();
      },
    },
  ];

  const actions = getDefaultFileMenuActions(file);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = actions.length * 44 + 16;
      const padding = 8;

      let left = rect.right + padding;
      let top = rect.top;
      let origin = 'top-left';

      // Horizontal positioning with boundary check
      if (left + menuWidth > window.innerWidth - padding) {
        left = rect.left - menuWidth - padding;
        origin = 'top-right';
      }

      // Ensure menu doesn't go off left edge
      if (left < padding) {
        left = padding;
      }

      // Ensure menu doesn't go off right edge
      if (left + menuWidth > window.innerWidth - padding) {
        left = window.innerWidth - menuWidth - padding;
      }

      // Vertical positioning with boundary check
      if (top + menuHeight > window.innerHeight - padding) {
        top = rect.bottom - menuHeight;
        origin = origin === 'top-right' ? 'bottom-right' : 'bottom-left';
      }

      // Ensure menu doesn't go off top edge
      if (top < padding) {
        top = padding;
      }

      // Final check: ensure menu fits within viewport height
      if (top + menuHeight > window.innerHeight - padding) {
        top = window.innerHeight - menuHeight - padding;
      }

      // Clamp to ensure menu is always visible
      top = Math.max(padding, Math.min(top, window.innerHeight - menuHeight - padding));
      left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding));

      setPosition({ top, left });
      setOriginPosition(origin);
    } else {
      setPosition(null);
    }
  }, [isOpen, anchorElement, actions.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  const getTransformOrigin = () => {
    switch (originPosition) {
      case 'top-right':
        return 'top right';
      case 'bottom-left':
        return 'bottom left';
      case 'bottom-right':
        return 'bottom right';
      default:
        return 'top left';
    }
  };

  const menuContent = (
    <AriaLabel label={`Actions for ${file.name}`} position="top">
      <div
        ref={menuRef}
        className={`
          fixed z-50 min-w-[200px] max-h-[calc(100vh-16px)] overflow-y-auto p-2
          bg-secondary border border-border rounded-lg shadow-xl
          transition-all duration-200 ease-out
          ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
          ${className}
        `}
        style={{
          top: position.top,
          left: position.left,
          transformOrigin: getTransformOrigin(),
        }}
        role="menu"
      >
        {actions.map((action, index) => (
          <React.Fragment key={action.id}>
            {index === actions.length - 1 && <div className="my-1 h-px bg-border" />}
            <button
              className={`
              w-full flex items-center gap-3 px-3 cursor-pointer py-2.5 text-sm rounded-md
              text-left transition-colors duration-150
              ${
                action.variant === 'destructive'
                  ? 'text-[#d93025] hover:bg-[#fce8e6] dark:text-[#f28b82] dark:hover:bg-[#5f2120]/20'
                  : 'text-foreground hover:bg-card'
              }
              ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!action.disabled) {
                  action.onClick?.(file);
                }
              }}
              disabled={action.disabled}
              role="menuitem"
            >
              <action.icon className="flex-shrink-0 h-4 w-4" />
              <span className="flex-1">{action.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </AriaLabel>
  );

  return <>{typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null}</>;
};
