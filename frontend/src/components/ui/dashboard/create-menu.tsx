'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, Upload, FolderUp } from 'lucide-react';

interface CreateMenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface CreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
}

const getCreateMenuActions = (): CreateMenuAction[] => [
  {
    id: 'new-folder',
    label: 'New folder',
    icon: <FolderPlus size={16} />,
    onClick: () => console.log('New folder'),
  },
  {
    id: 'file-upload',
    label: 'File upload',
    icon: <Upload size={16} />,
    onClick: () => console.log('File upload'),
  },
  {
    id: 'folder-upload',
    label: 'Folder upload',
    icon: <FolderUp size={16} />,
    onClick: () => console.log('Folder upload'),
  },
];

export const CreateMenu: React.FC<CreateMenuProps> = ({
  isOpen,
  onClose,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState('top-left');
  const actions = getCreateMenuActions();

  console.log('CreateMenu render - isOpen:', isOpen, 'anchorElement:', !!anchorElement); // Debug log

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = actions.length * 48 + 16; // Height for padding
      const padding = 8;

      let left = rect.left;
      let top = rect.bottom + padding;
      let origin = 'top-left';

      // Check if menu would go off screen horizontally
      if (left + menuWidth > window.innerWidth - padding) {
        left = rect.right - menuWidth;
        origin = 'top-right';
      }

      // Check if menu would go off screen vertically
      if (top + menuHeight > window.innerHeight - padding) {
        top = rect.top - menuHeight - padding;
        origin = origin === 'top-right' ? 'bottom-right' : 'bottom-left';
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
      aria-label="Create new items"
    >
      {actions.map((action, index) => (
        <>
          <button
            key={action.id}
            className="
              w-full flex items-center gap-3 px-3 py-3 text-sm rounded-md
              text-left transition-colors duration-150
              text-foreground hover:bg-card cursor-pointer
            "
            onClick={() => {
              action.onClick();
              onClose();
            }}
            role="menuitem"
          >
            <span className="flex-shrink-0">{action.icon}</span>
            <span className="flex-1">{action.label}</span>
          </button>
          {index === 0 && <div className="my-1 h-px bg-border" />}
        </>
      ))}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null;
};
