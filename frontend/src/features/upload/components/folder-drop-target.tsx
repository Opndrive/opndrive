/**
 * Folder Drop Target Component
 *
 * Wraps a folder row or card so files dropped on it upload into that folder,
 * and marks it while the pointer is over it.
 */

'use client';

import React, { ReactNode } from 'react';
import { useFolderDropTarget } from '../hooks/use-folder-drop-target';
import { DragDropTarget } from '../types/drag-drop-types';
import { ProcessedDragData } from '../types/folder-upload-types';

interface FolderDropTargetProps {
  children: ReactNode;
  folder: {
    id: string;
    name: string;
    path: string;
  };
  /** Absent means the folder takes no drops; they fall through to the listing. */
  onFilesDropped?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
  className?: string;
}

export function FolderDropTarget({
  children,
  folder,
  onFilesDropped,
  className = '',
}: FolderDropTargetProps) {
  const { dragHandlers, isDropTarget } = useFolderDropTarget({
    folder,
    onFilesDropped,
  });

  return (
    <div className={`relative transition-all duration-200 ${className}`} {...dragHandlers}>
      {children}

      {/* Sits above the row rather than tinting it, so the folder's own name and
          icon stay readable underneath - it is the label for where the files are
          about to land. `pointer-events-none` keeps it out of the hit test that
          picks the target in the first place. */}
      {isDropTarget ? (
        <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary bg-primary/10" />
      ) : null}
    </div>
  );
}
