'use client';

import React from 'react';
import { RenameDialog } from './rename-dialog';
import { RenameDuplicateDialog } from './rename-duplicate-dialog';
import { useRename } from '@/context/rename-context';

export const RenameModalManager: React.FC = () => {
  const {
    renameDialog,
    duplicateDialog,
    hideRenameDialog,
    hideDuplicateDialog,
    handleRenameConfirm,
  } = useRename();

  return (
    <>
      <RenameDialog
        isOpen={renameDialog.isOpen}
        onClose={hideRenameDialog}
        onConfirm={handleRenameConfirm}
        currentName={renameDialog.currentName}
        type={renameDialog.type}
        isRenaming={renameDialog.isRenaming}
      />

      <RenameDuplicateDialog
        isOpen={duplicateDialog.isOpen}
        onClose={hideDuplicateDialog}
        onReplace={duplicateDialog.onReplace || (() => {})}
        onKeepBoth={duplicateDialog.onKeepBoth || (() => {})}
        currentName={duplicateDialog.currentName}
        newName={duplicateDialog.newName}
        type={duplicateDialog.type}
      />
    </>
  );
};
