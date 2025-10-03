/**
 * Folder Drop Target Hook
 *
 * Handles drops onto specific folders in the file list
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useEnhancedDragDrop } from '../providers/enhanced-drag-drop-provider';
import { DragDropTarget } from '../types/drag-drop-types';

interface UseFolderDropTargetProps {
  folder: {
    id: string;
    name: string;
    path: string;
  };
  onFilesDropped: (files: File[], folders: File[], targetFolder: DragDropTarget) => void;
}

export function useFolderDropTarget({ folder, onFilesDropped }: UseFolderDropTargetProps) {
  const { registerDropTarget, unregisterDropTarget, setHoverTarget, getTargetState, source } =
    useEnhancedDragDrop();

  const targetId = `folder-${folder.id}`;

  // Register this folder as a drop target
  useEffect(() => {
    const target: DragDropTarget = {
      type: 'folder',
      id: targetId,
      path: folder.path,
      name: folder.name,
    };

    registerDropTarget(target);

    return () => {
      unregisterDropTarget(targetId);
    };
  }, [folder.id, folder.name, folder.path, targetId, registerDropTarget, unregisterDropTarget]);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files') {
        e.preventDefault();
        e.stopPropagation();

        setHoverTarget({
          type: 'folder',
          id: targetId,
          path: folder.path,
          name: folder.name,
        });
      }
    },
    [source, targetId, folder, setHoverTarget]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files') {
        e.preventDefault();
        e.stopPropagation();

        // Only clear hover if we're actually leaving this element
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          setHoverTarget(null);
        }
      }
    },
    [source, setHoverTarget]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files') {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    [source]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files' && e.dataTransfer?.files) {
        e.preventDefault();
        e.stopPropagation();

        // Process files
        const files: File[] = [];
        const folders: File[] = [];

        Array.from(e.dataTransfer.files).forEach((file) => {
          // TypeScript doesn't know about webkitRelativePath, but it exists on File objects in browsers
          const fileWithPath = file as File & { webkitRelativePath?: string };
          if (fileWithPath.webkitRelativePath && fileWithPath.webkitRelativePath !== '') {
            folders.push(file);
          } else {
            files.push(file);
          }
        });

        const target: DragDropTarget = {
          type: 'folder',
          id: targetId,
          path: folder.path,
          name: folder.name,
        };

        onFilesDropped(files, folders, target);
        setHoverTarget(null);
      }
    },
    [source, targetId, folder, onFilesDropped, setHoverTarget]
  );

  const targetState = getTargetState(targetId);

  return {
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    targetState,
    canAcceptDrop: targetState.canAcceptDrop && !!source,
  };
}
