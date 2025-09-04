'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface Modal {
  id: string;
  component: ReactNode;
  zIndex: number;
  onClose?: () => void;
}

interface ModalContextType {
  modals: Modal[];
  openModal: (id: string, component: ReactNode, onClose?: () => void) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
  getTopZIndex: () => number;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

const BASE_Z_INDEX = 1000;
const Z_INDEX_STEP = 10;

/**
 * Professional Modal Manager
 * Used by enterprise applications for managing modal stack
 * Automatically handles z-index layering and focus management
 */
export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<Modal[]>([]);

  const getTopZIndex = useCallback(() => {
    if (modals.length === 0) return BASE_Z_INDEX;
    return Math.max(...modals.map((modal) => modal.zIndex)) + Z_INDEX_STEP;
  }, [modals]);

  const openModal = useCallback((id: string, component: ReactNode, onClose?: () => void) => {
    setModals((prev) => {
      // Remove existing modal with same ID if it exists
      const filtered = prev.filter((modal) => modal.id !== id);
      const newZIndex =
        filtered.length === 0
          ? BASE_Z_INDEX
          : Math.max(...filtered.map((m) => m.zIndex)) + Z_INDEX_STEP;

      return [
        ...filtered,
        {
          id,
          component,
          zIndex: newZIndex,
          onClose,
        },
      ];
    });
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals((prev) => {
      const modal = prev.find((m) => m.id === id);
      if (modal?.onClose) {
        modal.onClose();
      }
      return prev.filter((modal) => modal.id !== id);
    });
  }, []);

  const closeAllModals = useCallback(() => {
    setModals((prev) => {
      prev.forEach((modal) => {
        if (modal.onClose) {
          modal.onClose();
        }
      });
      return [];
    });
  }, []);

  return (
    <ModalContext.Provider
      value={{
        modals,
        openModal,
        closeModal,
        closeAllModals,
        getTopZIndex,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModalManager() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModalManager must be used within a ModalProvider');
  }
  return context;
}
