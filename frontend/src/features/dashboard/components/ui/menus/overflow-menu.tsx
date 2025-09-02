'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Folder, FolderMenuAction } from '@/features/dashboard/types/folder';
import {
  Download,
  Edit3,
  Sparkles,
  Share2,
  FolderOpen,
  Info,
  Trash2,
  ThumbsDown,
} from 'lucide-react';

interface OverflowMenuProps {
  folder: Folder;
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
}

const getDefaultMenuActions = (_folder: Folder): FolderMenuAction[] => [
  {
    id: 'download',
    label: 'Download',
    icon: <Download size={16} />,
    onClick: (folder) => console.log('Download', folder.name),
  },
  {
    id: 'rename',
    label: 'Rename',
    icon: <Edit3 size={16} />,
    shortcut: 'Ctrl+Alt+E',
    onClick: (folder) => console.log('Rename', folder.name),
  },
  {
    id: 'summarise',
    label: 'Summarise this folder',
    icon: <Sparkles size={16} />,
    onClick: (folder) => console.log('Summarise', folder.name),
  },
  {
    id: 'share',
    label: 'Share',
    icon: <Share2 size={16} />,
    onClick: (folder) => console.log('Share', folder.name),
  },
  {
    id: 'organise',
    label: 'Organise',
    icon: <FolderOpen size={16} />,
    onClick: (folder) => console.log('Organise', folder.name),
  },
  {
    id: 'info',
    label: 'Folder information',
    icon: <Info size={16} />,
    onClick: (folder) => console.log('Folder info', folder.name),
  },
  {
    id: 'delete',
    label: 'Move to bin',
    icon: <Trash2 size={16} />,
    variant: 'destructive' as const,
    onClick: (folder) => console.log('Delete', folder.name),
  },
  {
    id: 'not-helpful',
    label: 'Not a helpful suggestion',
    icon: <ThumbsDown size={16} />,
    onClick: (folder) => console.log('Not helpful', folder.name),
  },
];

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  folder,
  isOpen,
  onClose,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const actions = getDefaultMenuActions(folder);

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 280;
      const menuHeight = actions.length * 40 + 16;

      let left = rect.right + 8;
      let top = rect.top;

      // Adjust if menu would go off screen horizontally
      if (left + menuWidth > window.innerWidth) {
        left = rect.left - menuWidth - 8;
      }

      // Adjust if menu would go off screen vertically
      if (top + menuHeight > window.innerHeight) {
        top = window.innerHeight - menuHeight - 8;
      }

      // Ensure menu doesn't go above viewport
      if (top < 8) {
        top = 8;
      }

      setPosition({ top, left });
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

  if (!isOpen) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className={`
        fixed z-50 min-w-[280px] p-2
        bg-secondary border border-border rounded-lg shadow-xl
        animate-in fade-in-0 zoom-in-95 duration-200
        ${className}
      `}
      style={{ top: position.top, left: position.left }}
      role="menu"
      aria-label={`Actions for ${folder.name}`}
    >
      {actions.map((action, index) => (
        <button
          key={action.id}
          className={`
            w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md
            text-left transition-colors duration-150
            ${
              action.variant === 'destructive'
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-foreground hover:bg-secondary/80'
            }
            ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            ${index > 0 && index === actions.length - 2 ? 'border-t border-border mt-1 pt-3' : ''}
          `}
          onClick={() => {
            if (!action.disabled) {
              action.onClick(folder);
              onClose();
            }
          }}
          disabled={action.disabled}
          role="menuitem"
        >
          {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
          <span className="flex-1">{action.label}</span>
          {action.shortcut && (
            <span className="text-xs text-muted-foreground">{action.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null;
};
