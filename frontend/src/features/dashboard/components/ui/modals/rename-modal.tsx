'use client';

import React from 'react';
import { useRename } from '@/features/dashboard/hooks/use-rename';
import { RenameDuplicateDialog } from '@/features/dashboard/components/ui/dialogs/rename-duplicate-dialog';

export function RenameModal() {
  const { duplicateDialog, hideDuplicateDialog } = useRename();

  if (!duplicateDialog.isOpen) {
    return null;
  }

  return (
    <RenameDuplicateDialog
      isOpen={duplicateDialog.isOpen}
      onClose={hideDuplicateDialog}
      onReplace={duplicateDialog.onReplace || (() => {})}
      onKeepBoth={duplicateDialog.onKeepBoth || (() => {})}
      currentName={duplicateDialog.currentName}
      newName={duplicateDialog.newName}
      type={duplicateDialog.type}
    />
  );
}
