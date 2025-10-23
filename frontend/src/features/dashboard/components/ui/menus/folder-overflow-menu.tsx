'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Folder, FolderMenuAction } from '@/features/dashboard/types/folder';
import { Edit3, Trash2 } from 'lucide-react';
import { useDeleteWithProgress } from '@/features/dashboard/hooks/use-delete-with-progress';
import { useRename } from '@/context/rename-context';
import { useDriveStore } from '@/context/data-context';
import { useRouter } from 'next/navigation';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import {
  CreditWarningDialog,
  shouldShowCreditWarning,
} from '@/shared/components/ui/credit-warning-dialog';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { FaFolderOpen } from 'react-icons/fa';

interface OverflowMenuProps {
  folder: Folder;
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement | null;
  className?: string;
  additionalActions?: FolderMenuAction[]; // Additional menu actions
  insertAdditionalActionsAfter?: string; // Where to insert additional actions (default: 'open')
}

export const FolderOverflowMenu: React.FC<OverflowMenuProps> = ({
  folder,
  isOpen,
  onClose,
  anchorElement,
  className = '',
  additionalActions = [],
  insertAdditionalActionsAfter = 'open',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [originPosition, setOriginPosition] = useState<
    'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  >('top-left');
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<'rename' | 'delete' | null>(null);

  const { deleteFolder, isDeleting } = useDeleteWithProgress();
  const { isRenaming, showRenameDialog: openRenameDialog } = useRename();
  const { currentPrefix } = useDriveStore();
  const router = useRouter();

  // Reset credit warning state when menu closes or component unmounts
  useEffect(() => {
    if (!isOpen) {
      setShowCreditWarning(false);
      setPendingAction(null);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setShowCreditWarning(false);
      setPendingAction(null);
    };
  }, []);

  // Handle rename with credit warning
  const handleRename = () => {
    if (shouldShowCreditWarning('folder-rename')) {
      setPendingAction('rename');
      setShowCreditWarning(true);
      // Don't close menu yet - let credit warning show first
    } else {
      executeRename();
      handleMenuClose();
    }
  };

  const executeRename = () => {
    openRenameDialog(folder, 'folder', currentPrefix || '');
    handleMenuClose(); // Close menu only after opening rename dialog
  };

  // Handle delete with credit warning
  const handleDelete = () => {
    if (shouldShowCreditWarning('folder-delete')) {
      setPendingAction('delete');
      setShowCreditWarning(true);
      // Don't close menu yet - let credit warning show first
    } else {
      executeDelete();
      handleMenuClose();
    }
  };

  const executeDelete = async () => {
    handleMenuClose(); // Close menu before showing confirmation
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
  };

  // Handle credit warning confirmation
  const handleCreditWarningConfirm = () => {
    if (pendingAction === 'rename') {
      executeRename();
    } else if (pendingAction === 'delete') {
      executeDelete();
    }
    setShowCreditWarning(false);
    setPendingAction(null);
  };

  const handleCreditWarningClose = () => {
    setShowCreditWarning(false);
    setPendingAction(null);
    onClose(); // Close menu when credit warning is cancelled
  };

  // Reset credit warning state and close menu
  const handleMenuClose = () => {
    // Reset credit warning state when menu closes
    setShowCreditWarning(false);
    setPendingAction(null);
    onClose();
  };

  const getDefaultMenuActions = (folder: Folder): FolderMenuAction[] => [
    {
      id: 'open',
      label: 'Open',
      icon: <FaFolderOpen className="flex-shrink-0 h-4 w-4" />,
      onClick: (_folder) => {
        const folderUrl = generateFolderUrl({ prefix: folder.Prefix });
        router.push(folderUrl);
        handleMenuClose();
      },
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Edit3 className="flex-shrink-0 h-4 w-4" />,
      disabled: isRenaming(folder.id || folder.Prefix || folder.name),
      onClick: handleRename,
    },
    {
      id: 'delete',
      label: isDeleting(folder.id || folder.Prefix || folder.name)
        ? 'Deleting...'
        : 'Delete forever',
      icon: <Trash2 className="flex-shrink-0 h-4 w-4" />,
      variant: 'destructive' as const,
      disabled: isDeleting(folder.id || folder.Prefix || folder.name),
      onClick: handleDelete,
    },
  ];

  // Merge additional actions with default actions
  const actions = useMemo(() => {
    if (additionalActions.length === 0) {
      return getDefaultMenuActions(folder);
    }

    const defaultActions = getDefaultMenuActions(folder);
    const insertIndex = defaultActions.findIndex(
      (action) => action.id === insertAdditionalActionsAfter
    );

    if (insertIndex === -1) {
      // If insertion point not found, append at the beginning
      return [...additionalActions, ...defaultActions];
    }

    // Insert after the specified action
    const result = [
      ...defaultActions.slice(0, insertIndex + 1),
      ...additionalActions,
      ...defaultActions.slice(insertIndex + 1),
    ];

    return result;
  }, [folder, additionalActions, insertAdditionalActionsAfter]);

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
      let origin: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'top-left';

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
    <AriaLabel label={`Actions for ${folder.name}`} position="top">
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
    </AriaLabel>
  );

  return (
    <>
      {/* Only render menu if credit warning is not showing */}
      {!showCreditWarning && typeof window !== 'undefined'
        ? createPortal(menuContent, document.body)
        : null}

      {/* Credit Warning Dialog - rendered outside portal to avoid conflicts */}
      {showCreditWarning && (
        <CreditWarningDialog
          isOpen={showCreditWarning}
          onClose={handleCreditWarningClose}
          onConfirm={handleCreditWarningConfirm}
          operationType={pendingAction === 'rename' ? 'folder-rename' : 'folder-delete'}
        />
      )}
    </>
  );
};
