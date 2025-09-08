'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Folder, FolderMenuAction } from '@/features/dashboard/types/folder';
import { Download, Edit3, Info, Trash2 } from 'lucide-react';
import { useDownload } from '@/features/dashboard/hooks/use-download';
import { useDelete } from '@/features/dashboard/hooks/use-delete';
import { useDetails } from '@/context/details-context';

interface OverflowMenuProps {
  folder: Folder;
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
}

export const FolderOverflowMenu: React.FC<OverflowMenuProps> = ({
  folder,
  isOpen,
  onClose,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState<
    'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >('top-left');
  const { isDownloading } = useDownload();
  const { deleteFolder, isDeleting } = useDelete();
  const { open: openDetails } = useDetails();

  const getDefaultMenuActions = (folder: Folder): FolderMenuAction[] => [
    {
      id: 'download',
      label: 'Download',
      icon: <Download className="flex-shrink-0 h-4 w-4" />,
      disabled: isDownloading(folder.id),
      onClick: (_folder) => {
        onClose();
      },
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Edit3 className="flex-shrink-0 h-4 w-4" />,
      onClick: () => {
        onClose();
      },
    },
    {
      id: 'info',
      label: 'Folder information',
      icon: <Info className="flex-shrink-0 h-4 w-4" />,
      onClick: () => {
        openDetails(folder);
        onClose();
      },
    },
    {
      id: 'delete',
      label: isDeleting(folder.id || folder.Prefix || folder.name)
        ? 'Deleting...'
        : 'Delete forever',
      icon: <Trash2 className="flex-shrink-0 h-4 w-4" />,
      variant: 'destructive' as const,
      disabled: isDeleting(folder.id || folder.Prefix || folder.name),
      onClick: async () => {
        const confirmDelete = window.confirm(
          `Are you sure you want to delete "${folder.name}" forever? This will delete the folder and all its contents. This action cannot be undone.`
        );

        if (confirmDelete) {
          try {
            await deleteFolder(folder);
          } catch (error) {
            console.error('Delete failed:', error);
          }
        }
        onClose();
      },
    },
  ];

  const actions = getDefaultMenuActions(folder);

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = actions.length * 44 + 16;
      const padding = 8;

      let left = rect.right + padding;
      let top = rect.top;
      let origin: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'top-left';

      if (left + menuWidth > window.innerWidth - padding) {
        left = rect.left - menuWidth - padding;
        origin = 'top-right';
      }

      if (top + menuHeight > window.innerHeight - padding) {
        top = rect.bottom - menuHeight;
        origin = origin === 'top-right' ? 'bottom-right' : 'bottom-left';

        if (top < padding) {
          top = window.innerHeight - menuHeight - padding;
        }
      }

      if (top < padding) {
        top = padding;
      }

      if (left < padding) {
        left = padding;
      }

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
    <div
      ref={menuRef}
      className={`
        fixed z-50 min-w-[200px] p-2
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
      aria-label={`Actions for ${folder.name}`}
    >
      {actions.map((action, index) => (
        <React.Fragment key={action.id}>
          {index === actions.length - 1 && <div className="my-1 h-px bg-border" />}
          <button
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md
              text-left transition-colors duration-150
              ${
                action.variant === 'destructive'
                  ? 'text-[#d93025] hover:bg-[#fce8e6] dark:text-[#f28b82] dark:hover:bg-[#5f2120]/20'
                  : 'text-foreground hover:bg-card'
              }
              ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            onClick={() => {
              if (!action.disabled) {
                action.onClick?.(folder);
              }
            }}
            disabled={action.disabled}
            role="menuitem"
          >
            <span className="flex-shrink-0">{action.icon}</span>
            <span className="flex-1">{action.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  return <>{typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null}</>;
};
