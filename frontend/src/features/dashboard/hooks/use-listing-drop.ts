'use client';

import type React from 'react';
import { useEnhancedDragDrop } from '@/features/upload/providers/enhanced-drag-drop-provider';
import { isExternalFileDrag } from '@/features/upload/utils/drag-events';
import { readDroppedItems } from '@/features/upload/utils/drop-preparation';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';

/**
 * Lets a listing take files dropped onto it, into the prefix it shows.
 *
 * `isDropTarget` is true while files are dragged over the page and no folder in
 * the listing is claiming them. Drawing the listing's outline at the same time
 * as a folder row's own highlight would offer two answers to where the files
 * are about to land, and the folder is the more specific one.
 *
 * The drag itself is tracked once, at the window, by the provider. Counting
 * dragenter against dragleave here drifted, because both fire once per
 * descendant.
 */
export function useListingDrop(onFilesDropped?: (processedData: ProcessedDragData) => void) {
  const { isFileDragActive, hoveredTargetId } = useEnhancedDragDrop();
  const isDropTarget = isFileDragActive && hoveredTargetId === null;

  /**
   * No stopPropagation here: the window listener that tracks the drag sits
   * above the listing, and stopping the events on their way up hid any drag
   * that began over the rows from it, leaving every folder row inert.
   */
  const onDragOver = (e: React.DragEvent) => {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
  };

  const onDrop = async (e: React.DragEvent) => {
    if (!isExternalFileDrag(e.dataTransfer)) return;

    e.preventDefault();

    // A drop on a folder row never reaches here - the row stops it - so
    // anything that does was aimed at the listing.
    if (!onFilesDropped) return;

    try {
      onFilesDropped(await readDroppedItems(e.dataTransfer.items));
    } catch (error) {
      console.error('Error processing drag and drop:', error);
    }
  };

  return { isDropTarget, onDragOver, onDrop };
}
