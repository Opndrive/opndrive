/**
 * Enhanced Drag and Drop Provider
 *
 * Provides comprehensive drag-and-drop functionality for both:
 * 1. Global directory drops (external files to current directory)
 * 2. Target-specific drops (files/folders to specific folders)
 */

'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { DragDropTarget, DragDropSource, DragDropContext } from '../types/drag-drop-types';

interface EnhancedDragDropContextType extends DragDropContext {
  registerDropTarget: (target: DragDropTarget) => void;
  unregisterDropTarget: (targetId: string) => void;
  setDragSource: (source: DragDropSource | null) => void;
  setHoverTarget: (target: DragDropTarget | null) => void;
  getTargetState: (targetId: string) => {
    isHovered: boolean;
    canAcceptDrop: boolean;
    isDraggedOver: boolean;
  };
}

const EnhancedDragDropContext = createContext<EnhancedDragDropContextType | undefined>(undefined);

interface EnhancedDragDropProviderProps {
  children: ReactNode;
  currentPath: string;
}

export function EnhancedDragDropProvider({
  children,
  currentPath: _currentPath,
}: EnhancedDragDropProviderProps) {
  const [dragContext, setDragContext] = useState<DragDropContext>({
    source: null,
    target: null,
    isActive: false,
    canDrop: false,
  });

  const [dropTargets, setDropTargets] = useState<Map<string, DragDropTarget>>(new Map());
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);

  // Register a drop target (folder or directory area)
  const registerDropTarget = useCallback((target: DragDropTarget) => {
    setDropTargets((prev) => new Map(prev.set(target.id, target)));
  }, []);

  // Unregister a drop target
  const unregisterDropTarget = useCallback((targetId: string) => {
    setDropTargets((prev) => {
      const newTargets = new Map(prev);
      newTargets.delete(targetId);
      return newTargets;
    });
  }, []);

  // Set the current drag source
  const setDragSource = useCallback(
    (source: DragDropSource | null) => {
      setDragContext((prev) => ({
        ...prev,
        source,
        isActive: !!source,
        canDrop: !!source && (!!prev.target || dropTargets.size > 0),
      }));

      // If setting a drag source, set up a fallback timeout to clear it
      if (source) {
        setTimeout(() => {
          setDragContext((prev) => {
            // Only clear if still the same source (not replaced by another drag)
            if (prev.source === source) {
              return {
                ...prev,
                source: null,
                isActive: false,
                canDrop: false,
              };
            }
            return prev;
          });
        }, 10000); // Clear after 10 seconds as fallback
      }
    },
    [dropTargets.size]
  );

  // Set the currently hovered target
  const setHoverTarget = useCallback((target: DragDropTarget | null) => {
    setHoveredTarget(target?.id || null);
    setDragContext((prev) => ({
      ...prev,
      target,
      canDrop: !!prev.source && !!target,
    }));
  }, []);

  // Get the state for a specific target
  const getTargetState = useCallback(
    (targetId: string) => {
      const target = dropTargets.get(targetId);
      const isHovered = hoveredTarget === targetId;

      // Determine if this target can accept the current drag source
      const canAcceptDrop = !!(
        dragContext.source &&
        target &&
        ((dragContext.source.type === 'external-files' && target.type === 'folder') ||
          (dragContext.source.type === 'external-files' && target.type === 'directory') ||
          (dragContext.source.type === 'internal-files' && target.type === 'folder') ||
          (dragContext.source.type === 'internal-folders' && target.type === 'folder'))
      );

      return {
        isHovered,
        canAcceptDrop,
        isDraggedOver: isHovered && canAcceptDrop && dragContext.isActive,
      };
    },
    [dropTargets, hoveredTarget, dragContext]
  );

  const contextValue: EnhancedDragDropContextType = {
    ...dragContext,
    registerDropTarget,
    unregisterDropTarget,
    setDragSource,
    setHoverTarget,
    getTargetState,
  };

  return (
    <EnhancedDragDropContext.Provider value={contextValue}>
      {children}
    </EnhancedDragDropContext.Provider>
  );
}

export function useEnhancedDragDrop() {
  const context = useContext(EnhancedDragDropContext);
  if (!context) {
    throw new Error('useEnhancedDragDrop must be used within EnhancedDragDropProvider');
  }
  return context;
}
