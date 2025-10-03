/**
 * Folder Drop Target Hook
 *
 * Handles drops onto specific folders in the file list
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useEnhancedDragDrop } from '../providers/enhanced-drag-drop-provider';
import { DragDropTarget } from '../types/drag-drop-types';
import { FolderStructureProcessor } from '../utils/folder-structure-processor';

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
    async (e: React.DragEvent) => {
      if (source && source.type === 'external-files' && e.dataTransfer) {
        e.preventDefault();
        e.stopPropagation();

        const target: DragDropTarget = {
          type: 'folder',
          id: targetId,
          path: folder.path,
          name: folder.name,
        };

        try {
          let processedData;

          if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            processedData = await FolderStructureProcessor.processDataTransferItems(
              e.dataTransfer.items
            );
          } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processedData = FolderStructureProcessor.processFileList(e.dataTransfer.files);
          } else {
            setHoverTarget(null);
            return;
          }

          const allFolderFiles = processedData.folderStructures.flatMap((folder) => folder.files);
          onFilesDropped(processedData.individualFiles, allFolderFiles, target);
        } catch (error) {
          console.error('Error processing folder drop:', error);
        }

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
