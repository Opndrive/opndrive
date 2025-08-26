'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Folder, FolderMenuAction } from '@/types/dashboard/folder';
import { Download, Edit3, Share2, Info, Trash2 } from 'lucide-react';

interface OverflowMenuProps {
  folder: Folder;
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
}

function getDefaultMenuActions(_folder: Folder): FolderMenuAction[] {
  return [
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
      onClick: (folder) => console.log('Rename', folder.name),
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 size={16} />,
      onClick: (folder) => console.log('Share', folder.name),
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
  ];
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  folder,
  isOpen,
  onClose,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState('top-left');
  const actions = getDefaultMenuActions(folder);

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 280;
      const menuHeight = actions.length * 44 + 16; // Slightly increased for padding
      const padding = 8;

      let left = rect.right + padding;
      let top = rect.top;
      let origin = 'top-left';

      // Check if menu would go off screen horizontally
      if (left + menuWidth > window.innerWidth - padding) {
        left = rect.left - menuWidth - padding;
        origin = 'top-right';
      }

      // Check if menu would go off screen vertically
      if (top + menuHeight > window.innerHeight - padding) {
        top = rect.bottom - menuHeight;
        origin = origin === 'top-right' ? 'bottom-right' : 'bottom-left';

        // If still off screen, align to bottom of viewport
        if (top < padding) {
          top = window.innerHeight - menuHeight - padding;
        }
      }

      // Ensure menu doesn't go above viewport
      if (top < padding) {
        top = padding;
      }

      // Ensure menu doesn't go off left edge
      if (left < padding) {
        left = padding;
      }

      setPosition({ top, left });
      setOriginPosition(origin);
    } else {
      // Reset position when menu closes
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

  // Get transform origin based on position
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
        fixed z-50 min-w-[280px] p-2
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
        <>
          {index > 0 && index === actions.length - 1 && <div className="my-1 h-px bg-border" />}
          <button
            key={action.id}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md
              text-left transition-colors duration-150 
              ${
                action.variant === 'destructive'
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-foreground hover:bg-card'
              }
              ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
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
        </>
      ))}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null;
};
