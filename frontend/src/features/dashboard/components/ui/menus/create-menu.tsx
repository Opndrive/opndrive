'use client';

import React, { useCallback } from 'react';
import { FolderPlus, Upload, FolderUp } from 'lucide-react';
import { pickMultipleFiles, pickFolder } from '@/features/upload/utils/file-picker';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { useUploadDispatch } from '@/features/upload/hooks/use-upload-dispatch';
import { useDriveStore } from '@/context/data-context';
import { FolderStructureProcessor } from '@/features/upload/utils/folder-structure-processor';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { menuContentClass, menuItemClass } from './menu-styles';

interface CreateMenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface CreateMenuProps {
  onNewFolderClick: () => void;
  /**
   * The button that opens the menu, rendered as the trigger itself. Replaces
   * the old isOpen/onClose/anchorElement trio and the hand-rolled positioning
   * that went with it.
   */
  trigger: React.ReactNode;
  /** Tooltip for the trigger. Omit to render the trigger without one. */
  triggerLabel?: string;
  className?: string;
  currentPath?: string;
}

export const CreateMenu: React.FC<CreateMenuProps> = ({
  onNewFolderClick,
  trigger,
  triggerLabel,
  className = '',
}) => {
  const dispatchDrop = useUploadDispatch();
  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  // The auth guards used to sit here, above every hook below them, so React
  // saw a different hook count before and after the session resolved. They now
  // live with the other early return, once all hooks have run.
  const currentPrefix = useDriveStore((state) => state.currentPrefix);

  const triggerFileUpload = useCallback(async () => {
    try {
      const result = await pickMultipleFiles();

      if (!result.cancelled && result.files && result.files.length > 0) {
        const processedData: ProcessedDragData = FolderStructureProcessor.processFileList(
          result.files
        );
        void dispatchDrop(processedData, currentPrefix ?? '', apiS3);
      }
    } catch {
      // Handle error silently or with proper error handling
    }
  }, [dispatchDrop, currentPrefix, apiS3]);

  const triggerFolderUpload = useCallback(async () => {
    try {
      const result = await pickFolder();

      if (!result.cancelled && result.files && result.files.length > 0) {
        const processedData: ProcessedDragData = FolderStructureProcessor.processFileList(
          result.files
        );
        void dispatchDrop(processedData, currentPrefix ?? '', apiS3);
      }
    } catch {
      // Handle error silently or with proper error handling
    }
  }, [dispatchDrop, currentPrefix, apiS3]);

  const actions: CreateMenuAction[] = [
    {
      id: 'new-folder',
      label: 'New folder',
      icon: <FolderPlus size={16} />,
      onClick: onNewFolderClick,
    },
    {
      id: 'file-upload',
      label: 'File upload',
      icon: <Upload size={16} />,
      onClick: () => void triggerFileUpload(),
    },
    {
      id: 'folder-upload',
      label: 'Folder upload',
      icon: <FolderUp size={16} />,
      onClick: () => void triggerFolderUpload(),
    },
  ];

  // Rendering nothing at all would take the Create button away with it, so the
  // trigger stays put and only the menu is withheld until the session is ready.
  const ready = !isLoading && isAuthenticated;

  const triggerNode = (
    <DropdownMenuTrigger asChild disabled={!ready}>
      {trigger}
    </DropdownMenuTrigger>
  );

  return (
    // modal={false}: a dropdown should not freeze the whole page. This menu used
    // to set document.body.style.overflow itself, which is half of the scroll
    // locking mess in #86.
    <DropdownMenu modal={false}>
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
        aria-label="Create"
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            className={menuItemClass}
            onSelect={() => action.onClick()}
          >
            <span className="shrink-0">{action.icon}</span>
            <span className="flex-1">{action.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
