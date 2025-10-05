/**
 * Drag Detection Wrapper
 *
 * Minimal wrapper that detects external file drags and registers them with the enhanced drag drop system
 * without creating any visual overlays or drop zones
 */

'use client';

import React, { ReactNode, useCallback, useEffect } from 'react';
import { useEnhancedDragDrop } from '../providers/enhanced-drag-drop-provider';

interface DragDetectionWrapperProps {
  children: ReactNode;
}

export function DragDetectionWrapper({ children }: DragDetectionWrapperProps) {
  const { setDragSource } = useEnhancedDragDrop();

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if this is an external file drag
      if (e.dataTransfer?.types?.includes('Files')) {
        setDragSource({
          type: 'external-files',
          items: [], // We don't have access to actual files until drop
          count: e.dataTransfer.items?.length || 0,
        });
      }
    },
    [setDragSource]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Clear drag source if we're leaving the entire wrapper area
      const rect = e.currentTarget.getBoundingClientRect();
      const isOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;

      if (isOutside || !e.currentTarget.contains(e.relatedTarget as Node)) {
        setDragSource(null);
      }
    },
    [setDragSource]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Immediately clear drag source
      setDragSource(null);

      // Force clear after a short delay to ensure it's cleared
      setTimeout(() => setDragSource(null), 50);
    },
    [setDragSource]
  );

  // Add global event listeners to handle drag end
  useEffect(() => {
    const handleDragEnd = () => {
      setDragSource(null);
    };

    const handleDragLeaveWindow = (e: DragEvent) => {
      // Clear drag when leaving window completely
      if (e.clientX === 0 && e.clientY === 0) {
        setDragSource(null);
      }
    };

    const handleMouseUp = () => {
      // Clear drag state on mouse up (after drop)
      setTimeout(() => setDragSource(null), 100);
    };

    const handleDragOver = (e: DragEvent) => {
      // Prevent default to allow drop
      e.preventDefault();
    };

    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('dragleave', handleDragLeaveWindow);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('dragover', handleDragOver);

    return () => {
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('dragleave', handleDragLeaveWindow);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [setDragSource]);

  return (
    <div
      className="h-full w-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
}
