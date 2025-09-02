'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import { Download, Edit3, Share2, Info, Trash2, Eye } from 'lucide-react';

interface FileOverflowMenuProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
}

const getDefaultFileMenuActions = (_file: FileItem): FileMenuAction[] => [
  {
    id: 'open',
    label: 'Open',
    icon: Eye,
    onClick: (file) => console.log('Open', file.name),
  },
  {
    id: 'download',
    label: 'Download',
    icon: Download,
    onClick: (file) => console.log('Download', file.name),
  },
  {
    id: 'rename',
    label: 'Rename',
    icon: Edit3,
    onClick: (file) => console.log('Rename', file.name),
  },
  {
    id: 'share',
    label: 'Share',
    icon: Share2,
    onClick: (file) => console.log('Share', file.name),
  },
  {
    id: 'info',
    label: 'File information',
    icon: Info,
    onClick: (file) => console.log('File info', file.name),
  },
  {
    id: 'delete',
    label: 'Move to bin',
    icon: Trash2,
    variant: 'destructive' as const,
    onClick: (file) => console.log('Delete', file.name),
  },
];

export const FileOverflowMenu: React.FC<FileOverflowMenuProps> = ({
  file,
  isOpen,
  onClose,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState('top-left');
  const actions = getDefaultFileMenuActions(file);

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = actions.length * 44 + 16;
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
      aria-label={`Actions for ${file.name}`}
    >
      {actions.map((action, index) => (
        <>
          {index === actions.length - 1 && <div className="my-1 h-px bg-border" />}
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
                action.onClick?.(file);
                onClose();
              }
            }}
            disabled={action.disabled}
            role="menuitem"
          >
            <action.icon className="flex-shrink-0 h-4 w-4" />
            <span className="flex-1">{action.label}</span>
          </button>
        </>
      ))}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null;
};
