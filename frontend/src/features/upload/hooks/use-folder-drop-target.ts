/**
 * Folder Drop Target Hook
 *
 * The handlers a folder row spreads onto itself so a file dropped on it uploads
 * into that folder.
 *
 * The row decides on its own, from the drop event, whether it will take the
 * drop. It used to ask the provider first, which made accepting a drop
 * conditional on some earlier handler having recorded the drag - and in the
 * list view nothing ever did, because the file table stopped the event before
 * it got that far. Nothing here waits on anything else now.
 *
 * Highlighting is not the row's job either: the provider hit-tests the pointer
 * on every dragover and names one folder, so the row only has to recognise its
 * own id.
 */

'use client';

import { useCallback } from 'react';
import { useEnhancedDragDrop } from '../providers/enhanced-drag-drop-provider';
import { DragDropTarget } from '../types/drag-drop-types';
import { FolderStructureProcessor } from '../utils/folder-structure-processor';
import { ProcessedDragData } from '../types/folder-upload-types';
import { DROP_TARGET_ATTRIBUTE, folderTargetId, isExternalFileDrag } from '../utils/drag-events';

interface UseFolderDropTargetProps {
  folder: {
    id: string;
    name: string;
    path: string;
  };
  /**
   * Where a drop on this folder goes.
   *
   * Absent means the folder cannot take one, and the row steps out of the way
   * entirely: no marker for the provider to find, nothing claimed, nothing
   * stopped. The drop falls through to the listing and uploads to the current
   * prefix. Standing in as a no-op instead - which is what the callers used to
   * pass - swallowed the drop, because claiming it also stops the listing
   * behind from ever seeing it.
   */
  onFilesDropped?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

export function useFolderDropTarget({ folder, onFilesDropped }: UseFolderDropTargetProps) {
  const { hoveredTargetId } = useEnhancedDragDrop();

  const targetId = folderTargetId(folder.id);
  const acceptsDrops = Boolean(onFilesDropped);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!acceptsDrops || !isExternalFileDrag(e.dataTransfer)) return;

      // An element that does not cancel dragover is not a drop target at all:
      // the browser refuses to fire drop on it.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [acceptsDrops]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!onFilesDropped || !isExternalFileDrag(e.dataTransfer)) return;

      e.preventDefault();
      // The listing this row sits inside uploads to the current prefix. Letting
      // the drop reach it as well is what put files beside the folder they were
      // aimed at rather than inside it.
      e.stopPropagation();

      const target: DragDropTarget = {
        type: 'folder',
        id: targetId,
        path: folder.path,
        name: folder.name,
      };

      try {
        const processedData = await FolderStructureProcessor.processDataTransferItems(
          e.dataTransfer.items
        );

        if (!processedData) return;

        onFilesDropped(processedData, target);
      } catch (error) {
        console.error('Error processing folder drop:', error);
      }
    },
    [targetId, folder.path, folder.name, onFilesDropped]
  );

  return {
    dragHandlers: {
      // Unmarked when there is nowhere to put a drop, so the provider's
      // hit-test walks past this row to the listing behind it.
      [DROP_TARGET_ATTRIBUTE]: acceptsDrops ? targetId : undefined,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    /** Is the pointer over this folder, with files in hand? */
    isDropTarget: acceptsDrops && hoveredTargetId === targetId,
  };
}
