'use client';

import React, { useMemo, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { menuContentClass, menuItemClass } from './menu-styles';

interface OverflowMenuProps {
  folder: Folder;
  /**
   * The button that opens the menu, rendered as the trigger itself rather than
   * placed beside it. The menu used to be positioned by hand against an
   * `anchorElement` prop, which is what Radix does for us now.
   */
  trigger: React.ReactNode;
  /** Tooltip for the trigger. Omit to render the trigger without one. */
  triggerLabel?: string;
  className?: string;
  additionalActions?: FolderMenuAction[]; // Additional menu actions
  insertAdditionalActionsAfter?: string; // Where to insert additional actions (default: 'open')
  onOpenChange?: (open: boolean) => void;
}

export const FolderOverflowMenu: React.FC<OverflowMenuProps> = ({
  folder,
  trigger,
  triggerLabel,
  className = '',
  additionalActions = [],
  insertAdditionalActionsAfter = 'open',
  onOpenChange,
}) => {
  const [pendingAction, setPendingAction] = useState<'rename' | 'delete' | null>(null);

  const { deleteFolder, isDeleting } = useDeleteWithProgress();
  const { isRenaming, showRenameDialog: openRenameDialog } = useRename();
  const { currentPrefix } = useDriveStore();
  const router = useRouter();

  const executeRename = () => {
    openRenameDialog(folder, 'folder', currentPrefix || '');
  };

  const executeDelete = async () => {
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

  // Selecting an item closes the menu on its own now, so these only decide
  // whether the credit warning stands between the click and the work.
  const handleRename = () => {
    if (shouldShowCreditWarning('folder-rename')) {
      setPendingAction('rename');
    } else {
      executeRename();
    }
  };

  const handleDelete = () => {
    if (shouldShowCreditWarning('folder-delete')) {
      setPendingAction('delete');
    } else {
      void executeDelete();
    }
  };

  const handleCreditWarningConfirm = () => {
    if (pendingAction === 'rename') {
      executeRename();
    } else if (pendingAction === 'delete') {
      void executeDelete();
    }
    setPendingAction(null);
  };

  const actions = useMemo(() => {
    const defaultActions: FolderMenuAction[] = [
      {
        id: 'open',
        label: 'Open',
        icon: <FaFolderOpen className="h-4 w-4 shrink-0" />,
        onClick: () => {
          router.push(generateFolderUrl({ prefix: folder.Prefix }));
        },
      },
      {
        id: 'rename',
        label: 'Rename',
        icon: <Edit3 className="h-4 w-4 shrink-0" />,
        disabled: isRenaming(folder.id || folder.Prefix || folder.name),
        onClick: handleRename,
      },
      {
        id: 'delete',
        label: isDeleting(folder.id || folder.Prefix || folder.name)
          ? 'Deleting...'
          : 'Delete forever',
        icon: <Trash2 className="h-4 w-4 shrink-0" />,
        variant: 'destructive' as const,
        disabled: isDeleting(folder.id || folder.Prefix || folder.name),
        onClick: handleDelete,
      },
    ];

    if (additionalActions.length === 0) {
      return defaultActions;
    }

    const insertIndex = defaultActions.findIndex(
      (action) => action.id === insertAdditionalActionsAfter
    );

    if (insertIndex === -1) {
      // If insertion point not found, append at the beginning
      return [...additionalActions, ...defaultActions];
    }

    return [
      ...defaultActions.slice(0, insertIndex + 1),
      ...additionalActions,
      ...defaultActions.slice(insertIndex + 1),
    ];
    // handleRename/handleDelete are redefined every render and only read state
    // through the hooks above, so listing them would rebuild this every time
    // without changing what it produces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, additionalActions, insertAdditionalActionsAfter, isRenaming, isDeleting, router]);

  const triggerNode = <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>;

  return (
    <>
      {/* modal={false}: a dropdown should not freeze the whole page. Each menu
          used to set document.body.style.overflow itself, which is half of the
          scroll locking mess in #86. */}
      <DropdownMenu modal={false} onOpenChange={onOpenChange}>
        {triggerLabel ? (
          <AriaLabel label={triggerLabel} position="top">
            {triggerNode}
          </AriaLabel>
        ) : (
          triggerNode
        )}

        <DropdownMenuContent
          align="start"
          className={`${menuContentClass} ${className}`}
          aria-label={`Actions for ${folder.name}`}
        >
          {actions.map((action, index) => (
            <React.Fragment key={action.id}>
              {index === actions.length - 1 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={menuItemClass}
                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                disabled={action.disabled}
                onSelect={() => action.onClick?.(folder)}
              >
                <span className="shrink-0">{action.icon}</span>
                <span className="flex-1">{action.label}</span>
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingAction && (
        <CreditWarningDialog
          isOpen
          onClose={() => setPendingAction(null)}
          onConfirm={handleCreditWarningConfirm}
          operationType={pendingAction === 'rename' ? 'folder-rename' : 'folder-delete'}
        />
      )}
    </>
  );
};
