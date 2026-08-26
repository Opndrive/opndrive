/**
 * Drag and Drop Provider
 *
 * The one place that knows a file drag is happening and which folder it is
 * over. Both facts come from a single set of window listeners rather than from
 * handlers scattered down the tree, because the tree could not answer them
 * reliably: a component that stopped an event on its way up - as the file
 * listing did - silently blinded every component above it for the whole drag.
 *
 * What lives here is only what the whole app needs to agree on. Accepting a
 * drop is the target's own business, decided from the drop event itself.
 */

'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { dropTargetIdAt, isExternalFileDrag } from '../utils/drag-events';

interface EnhancedDragDropContextType {
  /** Are files from outside the browser being dragged over the app right now? */
  isFileDragActive: boolean;
  /** The folder under the pointer, or null when it is over anything else. */
  hoveredTargetId: string | null;
}

const EnhancedDragDropContext = createContext<EnhancedDragDropContextType | undefined>(undefined);

/**
 * How long dragover has to go quiet before the drag counts as gone.
 *
 * There is no reliable event for "the pointer left the window". `dragleave`
 * fires on every boundary inside the page too, and the usual way to tell them
 * apart - a null `relatedTarget` - does not work: WebKit reports null for every
 * dragleave it fires, so on Safari that reads as leaving the window each time
 * the pointer crosses a row, and the highlight strobes.
 *
 * Silence is the reliable signal instead. The drag-and-drop model reruns every
 * 350ms while the pointer is over the document, even held still, so dragover
 * cannot go quiet for longer than that without the drag having ended - dropped
 * outside the window, cancelled, or carried away. 500ms leaves room for a slow
 * frame without letting a stale overlay linger.
 *
 * This is not the ten-second fallback that was here before. That one fired
 * during a drag and killed it; this one is restarted by every dragover, so it
 * can only fire once the drag has stopped reporting itself.
 */
const DRAG_IDLE_MS = 500;

export function EnhancedDragDropProvider({ children }: { children: ReactNode }) {
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const stopWatchdog = () => {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const end = () => {
      stopWatchdog();
      setIsFileDragActive(false);
      setHoveredTargetId(null);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isExternalFileDrag(e.dataTransfer)) return;

      // An uncancelled dragover means the browser keeps the drop for itself and
      // navigates away from the app to display the file.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      setIsFileDragActive(true);
      // dragover repeats for as long as the pointer is inside, so this is a
      // fresh reading on every move rather than a running tally that can drift.
      // Setting the value it already holds is free: React bails out of the
      // re-render, and the memo below keeps consumers from seeing a new object.
      setHoveredTargetId(dropTargetIdAt(e.target));

      stopWatchdog();
      idleTimer = setTimeout(end, DRAG_IDLE_MS);
    };

    const handleDrop = (e: DragEvent) => {
      if (isExternalFileDrag(e.dataTransfer)) e.preventDefault();
      end();
    };

    // Capture, because a folder row stops the drop event so the listing behind
    // it does not upload to the current prefix as well, and a stopped event
    // never reaches a listener waiting on the way back up. Ending the drag
    // before the row handles it is safe: the row reads the folder it is for
    // from its own props, never from here.
    const options = { capture: true } as const;
    window.addEventListener('dragover', handleDragOver, options);
    window.addEventListener('drop', handleDrop, options);
    window.addEventListener('dragend', end, options);

    return () => {
      stopWatchdog();
      window.removeEventListener('dragover', handleDragOver, options);
      window.removeEventListener('drop', handleDrop, options);
      window.removeEventListener('dragend', end, options);
    };
  }, []);

  // Every folder row reads this context, so an unmemoised object would re-render
  // all of them on any render of this provider, drag or no drag.
  const value = useMemo(
    () => ({ isFileDragActive, hoveredTargetId }),
    [isFileDragActive, hoveredTargetId]
  );

  return (
    <EnhancedDragDropContext.Provider value={value}>{children}</EnhancedDragDropContext.Provider>
  );
}

export function useEnhancedDragDrop() {
  const context = useContext(EnhancedDragDropContext);
  if (!context) {
    throw new Error('useEnhancedDragDrop must be used within EnhancedDragDropProvider');
  }
  return context;
}
