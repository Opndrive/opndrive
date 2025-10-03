/**
 * Folder Drop Target Component
 *
 * Visual component for folders that can accept drag-and-drop
 */

'use client';

import React, { ReactNode } from 'react';
import { useFolderDropTarget } from '../hooks/use-folder-drop-target';
import { DragDropTarget } from '../types/drag-drop-types';

interface FolderDropTargetProps {
  children: ReactNode;
  folder: {
    id: string;
    name: string;
    path: string;
  };
  onFilesDropped: (files: File[], folders: File[], targetFolder: DragDropTarget) => void;
  className?: string;
}

export function FolderDropTarget({
  children,
  folder,
  onFilesDropped,
  className = '',
}: FolderDropTargetProps) {
  const { dragHandlers, targetState } = useFolderDropTarget({
    folder,
    onFilesDropped,
  });

  return (
    <div
      className={`
        relative transition-all duration-200
        ${className}
      `}
      {...dragHandlers}
    >
      {/* Original content */}
      <div
        className={`transition-all duration-200 ${targetState.isDraggedOver ? 'opacity-90' : 'opacity-100'}`}
      >
        {children}
      </div>

      {/* Whitish overlay only when being dragged over (hovered) */}
      {targetState.isDraggedOver && (
        <div className="absolute inset-0 bg-white/20 dark:bg-white/10 rounded border-2 border-blue-400 pointer-events-none" />
      )}
    </div>
  );
}
