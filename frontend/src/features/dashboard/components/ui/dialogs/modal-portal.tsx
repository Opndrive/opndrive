'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
  containerId?: string;
  zIndex?: number;
}

/**
 * Professional Modal Portal Component
 * Used by enterprise applications for proper modal layering
 * Ensures modals are rendered at the top level of the DOM tree
 */
export function ModalPortal({
  children,
  containerId = 'modal-root',
  zIndex = 1000,
}: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Ensure we're on the client side
    setMounted(true);

    // Get or create the modal container
    let modalContainer = document.getElementById(containerId);

    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = containerId;
      modalContainer.style.position = 'fixed';
      modalContainer.style.top = '0';
      modalContainer.style.left = '0';
      modalContainer.style.width = '100%';
      modalContainer.style.height = '100%';
      modalContainer.style.pointerEvents = 'none';
      modalContainer.style.zIndex = zIndex.toString();
      document.body.appendChild(modalContainer);
    }

    setContainer(modalContainer);

    return () => {
      // Cleanup if needed
      if (modalContainer && modalContainer.children.length === 0) {
        document.body.removeChild(modalContainer);
      }
    };
  }, [containerId, zIndex]);

  if (!mounted || !container) {
    return null;
  }

  return createPortal(children, container);
}
