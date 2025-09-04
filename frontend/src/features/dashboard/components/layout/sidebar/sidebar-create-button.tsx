import React, { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { CreateMenu } from '../../ui';
import { CreateFolderDialog } from '../../ui/dialogs/create-folder-dialog';
import { DuplicateDialog } from '@/features/upload/components/duplicate-dialog';
import { useDriveStore } from '@/context/data-context';
import { useFolderCreation } from '@/features/dashboard/hooks/use-folder-creation';
import { useNotification } from '@/context/notification-context';

interface SidebarCreateButtonProps {
  onClick?: () => void;
  className?: string;
}

export const SidebarCreateButton: React.FC<SidebarCreateButtonProps> = ({ onClick, className }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { currentPrefix } = useDriveStore();
  const { success, error } = useNotification();

  // Folder creation logic
  const { handleFolderCreation, duplicateDialog, hideDuplicateDialog } = useFolderCreation({
    currentPath: currentPrefix || '',
    onFolderCreated: (folderName) => {
      success(`Folder "${folderName}" created successfully`);
      setShowCreateFolderDialog(false);
    },
  });

  const handleClick = () => {
    setIsMenuOpen(true);

    if (onClick) {
      onClick();
    }
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  const handleNewFolderClick = () => {
    setIsMenuOpen(false); // Close menu
    setShowCreateFolderDialog(true); // Open dialog
  };

  const handleCreateFolder = async (folderName: string) => {
    try {
      await handleFolderCreation(folderName);
    } catch (err) {
      // Extract meaningful error message
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';

      // Show user-friendly error message based on the actual error
      if (errorMessage.includes('Key starts with /')) {
        error('Invalid folder path. Please try a different name.');
      } else if (errorMessage.includes('already exists')) {
        error('A folder with this name already exists.');
      } else if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
        error('You do not have permission to create folders here.');
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        error('Network error. Please check your connection and try again.');
      } else if (errorMessage.includes('Create folder failed')) {
        error('Failed to create folder. Please try a different name or check your permissions.');
      } else {
        error(`Failed to create folder: ${errorMessage}`);
      }
    }
  };

  const handleCloseFolderDialog = () => {
    setShowCreateFolderDialog(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={cn(
          'flex items-center w-full px-4 py-3 mb-4 text-sm font-medium',
          'bg-card text-card-foreground border border-border',
          'rounded-2xl shadow-sm hover:shadow-md transition-all duration-200',
          'hover:bg-accent hover:text-foreground',
          className
        )}
      >
        <Plus className="w-5 h-5 mr-3 flex-shrink-0" />
        <span>New</span>
      </button>

      <CreateMenu
        isOpen={isMenuOpen}
        onClose={handleMenuClose}
        onNewFolderClick={handleNewFolderClick}
        anchorElement={buttonRef.current}
        currentPath={currentPrefix || ''}
      />

      {/* Folder creation dialog - managed at this level */}
      <CreateFolderDialog
        isOpen={showCreateFolderDialog}
        onClose={handleCloseFolderDialog}
        onConfirm={handleCreateFolder}
      />

      {/* Duplicate folder dialog - rendered at same level as CreateFolderDialog with higher z-index */}
      {duplicateDialog.isOpen && (
        <DuplicateDialog
          isOpen={duplicateDialog.isOpen}
          onClose={hideDuplicateDialog}
          duplicateItem={{
            name: duplicateDialog.folderName,
            type: 'folder',
          }}
          onReplace={duplicateDialog.onReplace || (() => {})}
          onKeepBoth={duplicateDialog.onKeepBoth || (() => {})}
        />
      )}
    </>
  );
};
