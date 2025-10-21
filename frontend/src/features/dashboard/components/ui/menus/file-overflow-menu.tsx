'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import {
  Download,
  Edit3,
  Info,
  Trash2,
  Eye,
  Share,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
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
  additionalActions?: FileMenuAction[];
  insertAdditionalActionsAfter?: string;
}

export const FileOverflowMenu: React.FC<FileOverflowMenuProps> = ({
  file,
  allFiles = [],
  isOpen,
  onClose,
  anchorElement,
  className = '',
  additionalActions = [],
  insertAdditionalActionsAfter = 'open',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState('top-left');
  const [isOpenWithSubmenuVisible, setIsOpenWithSubmenuVisible] = useState(false);
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [openWithButtonRef, setOpenWithButtonRef] = useState<HTMLButtonElement | null>(null);

  const { downloadFile, isDownloading } = useDownload();
  const { isRenaming, showRenameDialog: openRenameDialog } = useRename();
  const { open: openDetails } = useDetails();
  const { openPreview } = useFilePreview();
  const { currentPrefix } = useDriveStore();
  const { openShareDialog } = useShare();
  const { deleteFile, isDeleting } = useDeleteWithProgress();

  // Handle preview action
  const handlePreview = () => {
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
  };

  // Handle open in new tab
  const handleOpenInNewTab = () => {
    // For now, use preview in new tab - you can customize this later

    // Open preview in a new window/tab (simplified implementation)
    window.open(window.location.href, '_blank');
    onClose();
  };

  const getDefaultFileMenuActions = (file: FileItem): FileMenuAction[] => [
    {
      id: 'open',
      label: 'Open with',
      icon: Eye,
      // This will be handled specially to show submenu
      onClick: () => {
        // Submenu handles the actual actions
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

  // Merge additional actions with default actions
  const actions = React.useMemo(() => {
    const defaultActions = getDefaultFileMenuActions(file);

    if (additionalActions.length === 0) {
      return defaultActions;
    }

    // Find insertion point
    const insertIndex = defaultActions.findIndex(
      (action) => action.id === insertAdditionalActionsAfter
    );

    if (insertIndex === -1) {
      // If insertion point not found, append at the beginning
      return [...additionalActions, ...defaultActions];
    }

    // Insert after the specified action
    return [
      ...defaultActions.slice(0, insertIndex + 1),
      ...additionalActions,
      ...defaultActions.slice(insertIndex + 1),
    ];
  }, [file, additionalActions, insertAdditionalActionsAfter]);

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

  // Position submenu when "Open with" is hovered
  useEffect(() => {
    if (isOpenWithSubmenuVisible && openWithButtonRef && menuRef.current) {
      const buttonRect = openWithButtonRef.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const submenuWidth = 180;
      const padding = 4;
      const gap = 8; // Gap between main menu and submenu

      // Position submenu to the right of the main menu, not the button
      let left = menuRect.right + gap;
      let top = buttonRect.top;

      // Check if submenu goes off right edge
      if (left + submenuWidth > window.innerWidth - padding) {
        // Position to the left of the main menu
        left = menuRect.left - submenuWidth - gap;
      }

      // Ensure submenu doesn't go off screen
      if (left < padding) {
        left = padding;
      }

      if (top < padding) {
        top = padding;
      }

      setSubmenuPosition({ top, left });
    } else {
      setSubmenuPosition(null);
    }
  }, [isOpenWithSubmenuVisible, openWithButtonRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInMenu = menuRef.current?.contains(target);
      const clickedInSubmenu = submenuRef.current?.contains(target);

      if (!clickedInMenu && !clickedInSubmenu) {
        setIsOpenWithSubmenuVisible(false);
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isOpenWithSubmenuVisible) {
          setIsOpenWithSubmenuVisible(false);
        } else {
          onClose();
        }
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
  }, [isOpen, isOpenWithSubmenuVisible, onClose]);

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

  const submenuContent = isOpenWithSubmenuVisible && submenuPosition && (
    <div
      ref={submenuRef}
      className="fixed z-[60] min-w-[180px] p-2 bg-secondary border border-border rounded-lg shadow-xl"
      style={{
        top: submenuPosition.top,
        left: submenuPosition.left,
      }}
      role="menu"
    >
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md text-left transition-colors duration-150 text-foreground hover:bg-card cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handlePreview();
        }}
        role="menuitem"
      >
        <Eye className="flex-shrink-0 h-4 w-4" />
        <span className="flex-1">Preview</span>
      </button>
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md text-left transition-colors duration-150 text-foreground hover:bg-card cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleOpenInNewTab();
        }}
        role="menuitem"
      >
        <ExternalLink className="flex-shrink-0 h-4 w-4" />
        <span className="flex-1">Open in new tab</span>
      </button>
    </div>
  );

  const menuContent = (
    <>
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
                ref={action.id === 'open' ? setOpenWithButtonRef : undefined}
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
                    if (action.id === 'open') {
                      // Toggle submenu instead of direct action
                      setIsOpenWithSubmenuVisible(!isOpenWithSubmenuVisible);
                    } else {
                      action.onClick?.(file);
                    }
                  }
                }}
                onMouseEnter={() => {
                  if (action.id === 'open') {
                    setIsOpenWithSubmenuVisible(true);
                  } else {
                    setIsOpenWithSubmenuVisible(false);
                  }
                }}
                disabled={action.disabled}
                role="menuitem"
              >
                <action.icon className="flex-shrink-0 h-4 w-4" />
                <span className="flex-1">{action.label}</span>
                {action.id === 'open' && <ChevronRight className="flex-shrink-0 h-4 w-4 ml-auto" />}
              </button>
            </React.Fragment>
          ))}
        </div>
      </AriaLabel>
      {submenuContent}
    </>
  );

  return <>{typeof window !== 'undefined' ? createPortal(menuContent, document.body) : null}</>;
};
