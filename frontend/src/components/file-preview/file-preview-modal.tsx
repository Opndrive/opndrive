'use client';

import React, { useEffect, useCallback } from 'react';
import { useFilePreview } from '@/context/file-preview-context';
import { PreviewHeader } from './preview-header';
import { PreviewContent } from './preview-content';

export function FilePreviewModal() {
  const {
    isOpen,
    file: currentFile,
    currentIndex,
    files,
    closePreview,
    navigateNext,
    navigatePrevious,
  } = useFilePreview();

  // Keyboard event handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          closePreview();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            navigatePrevious();
          }
          break;
        case 'ArrowRight':
          if (currentIndex < files.length - 1) {
            navigateNext();
          }
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [isOpen, currentIndex, files.length, closePreview, navigateNext, navigatePrevious]
  );

  // Add/remove keyboard event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !currentFile) {
    return null;
  }

  const showNavigation = files.length > 1;
  const canNavigateNext = currentIndex < files.length - 1;
  const canNavigatePrevious = currentIndex > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--preview-modal-backdrop)' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        onClick={closePreview}
        style={{ backgroundColor: 'transparent' }}
      />

      {/* Modal Content */}
      <div
        className="relative w-full h-full flex flex-col"
        style={{
          backgroundColor: 'var(--preview-modal-bg)',
          boxShadow: 'var(--preview-modal-shadow)',
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: 'var(--preview-modal-header-bg)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <PreviewHeader
            file={currentFile}
            currentIndex={currentIndex}
            totalFiles={files.length}
            showNavigation={showNavigation}
            onClose={closePreview}
            onNavigateNext={canNavigateNext ? navigateNext : undefined}
            onNavigatePrevious={canNavigatePrevious ? navigatePrevious : undefined}
            canNavigateNext={canNavigateNext}
            canNavigatePrevious={canNavigatePrevious}
          />
        </div>

        {/* Content */}
        <div
          className="flex-1 relative"
          style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
        >
          <PreviewContent file={currentFile} />
        </div>
      </div>
    </div>
  );
}
