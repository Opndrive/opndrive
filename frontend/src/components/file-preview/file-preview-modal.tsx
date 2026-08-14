'use client';
import { useScrollLock } from '@/hooks/use-scroll-lock';

import React, { useEffect, useCallback, useRef } from 'react';
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

  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

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
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  /**
   * Focus went nowhere when this opened, so a keyboard user was left on the row
   * behind it, tabbing through a page they could no longer see. Moving focus to
   * the panel puts them inside the dialog, and putting it back on close returns
   * them to the file they came from rather than the top of the document.
   *
   * Deliberately no focus trap. This one embeds the pdf, monaco and xlsx
   * viewers, which manage focus themselves, and a trap wrapped around them is
   * the kind of thing that breaks a viewer in a way nobody notices for months.
   * The panel is full screen, so there is nothing visible behind it to tab to,
   * and `aria-modal` tells assistive tech the rest of the page is out of play.
   *
   * Keyed on `isOpen` alone, which relies on OPEN_PREVIEW setting the file in
   * the same dispatch. If those ever split, the panel could mount after this
   * has run and focus would stay outside. Navigating between files must not
   * re-run it either, or focus would be yanked back off the header controls.
   */
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  // Tied to what actually renders, not just `isOpen`: locking while the modal
  // bails out for a missing file would leave the page frozen behind nothing.
  useScrollLock(isOpen && !!currentFile);

  if (!isOpen || !currentFile) {
    return null;
  }

  const showNavigation = files.length > 1;
  const canNavigateNext = currentIndex < files.length - 1;
  const canNavigatePrevious = currentIndex > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
    >
      {/* Backdrop. Hidden from assistive tech and left out of the tab order on
          purpose: it is a click shortcut, and Escape and the header's close
          button are the keyboard paths to the same thing. */}
      <div
        className="absolute inset-0"
        onClick={closePreview}
        style={{ backgroundColor: 'transparent' }}
        aria-hidden="true"
      />

      {/* Modal Content - Full Screen */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${currentFile.name}`}
        tabIndex={-1}
        className="relative w-full h-full flex flex-col outline-none"
        style={{
          backgroundColor: 'var(--background)',
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0"
          style={{
            backgroundColor: 'var(--card)',
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
        <div className="flex-1 overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
          <PreviewContent
            key={`${currentFile.key || currentFile.id}-${currentIndex}`}
            file={currentFile}
          />
        </div>
      </div>
    </div>
  );
}
