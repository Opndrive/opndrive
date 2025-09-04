'use client';

import { useModalManager } from './modal-manager';
import { ModalPortal } from './modal-portal';

/**
 * Professional Modal Renderer
 * Renders all modals in the proper order with correct z-indexing
 * Used by enterprise applications for reliable modal management
 */
export function ModalRenderer() {
  const { modals } = useModalManager();

  return (
    <>
      {modals.map((modal) => (
        <ModalPortal key={modal.id} zIndex={modal.zIndex}>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'auto',
              zIndex: modal.zIndex,
            }}
          >
            {modal.component}
          </div>
        </ModalPortal>
      ))}
    </>
  );
}
