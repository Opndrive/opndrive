'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type Ctx = { isOpen: boolean; open: () => void; close: () => void; toggle: () => void };

const DetailsContext = createContext<Ctx | null>(null);

export const DetailsProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((p) => !p);
  return (
    <DetailsContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </DetailsContext.Provider>
  );
};

export const useDetails = () => {
  const ctx = useContext(DetailsContext);
  if (!ctx) throw new Error('useDetails must be used within DetailsProvider');
  return ctx;
};
