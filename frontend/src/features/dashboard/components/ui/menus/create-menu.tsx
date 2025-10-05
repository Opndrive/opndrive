'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, Upload, FolderUp } from 'lucide-react';
import { pickMultipleFiles, pickFolder } from '@/features/upload/utils/file-picker';
import { useApiS3 } from '@/hooks/use-auth';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useDriveStore } from '@/context/data-context';
import { FolderStructureProcessor } from '@/features/upload/utils/folder-structure-processor';
import { AriaLabel } from '@/shared/components/custom-aria-label';

interface CreateMenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface CreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNewFolderClick: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
  currentPath?: string;
}

export const CreateMenu: React.FC<CreateMenuProps> = ({
  isOpen,
  onClose,
  onNewFolderClick,
  anchorElement,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { handleFilesDroppedToDirectory } = useUploadStore();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState<
    'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >('top-left');

  const apiS3 = useApiS3();

  if (!apiS3) {
    return 'Loading...';
  }
  const { currentPrefix } = useDriveStore();

  //  file upload handlers using utility functions
  const triggerFileUpload = useCallback(async () => {
    try {
      const result = await pickMultipleFiles();

      if (!result.cancelled && result.files && result.files.length > 0) {
        const processedData: ProcessedDragData = FolderStructureProcessor.processFileList(
          result.files
        );
        handleFilesDroppedToDirectory(processedData, currentPrefix, apiS3);
        onClose(); // Close menu after successful file selection
      }
    } catch {
      // Handle error silently or with proper error handling
    }
  }, [handleFilesDroppedToDirectory, onClose, currentPrefix, apiS3]);

  const triggerFolderUpload = useCallback(async () => {
    try {
      const result = await pickFolder();

      if (!result.cancelled && result.files && result.files.length > 0) {
        const processedData: ProcessedDragData = FolderStructureProcessor.processFileList(
          result.files
        );
        handleFilesDroppedToDirectory(processedData, currentPrefix, apiS3);
        onClose(); // Close menu after successful folder selection
      }
    } catch {
      // Handle error silently or with proper error handling
    }
  }, [handleFilesDroppedToDirectory, onClose, currentPrefix, apiS3]);

  // Handle new folder action - simple approach
  const handleNewFolderClick = useCallback(() => {
    onNewFolderClick(); // Call the prop function
  }, [onNewFolderClick]);

  const getCreateMenuActions = (): CreateMenuAction[] => [
    {
      id: 'new-folder',
      label: 'New folder',
      icon: <FolderPlus size={16} />,
      onClick: handleNewFolderClick,
    },
    {
      id: 'file-upload',
      label: 'File upload',
      icon: <Upload size={16} />,
      onClick: triggerFileUpload,
    },
    {
      id: 'folder-upload',
      label: 'Folder upload',
      icon: <FolderUp size={16} />,
      onClick: triggerFolderUpload,
    },
  ];

  const actions = getCreateMenuActions();

  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = actions.length * 48 + 16; // Height for padding
      const padding = 8;

      let left = rect.left;
      let top = rect.bottom + padding;
      let origin: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'top-left';

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
    <AriaLabel label="Create new items" position="top">
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
      >
        {actions.map((action, index) => (
          <React.Fragment key={action.id}>
            <button
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
          </React.Fragment>
        ))}
      </div>
    </AriaLabel>
  );

  return <>{typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null}</>;
};
