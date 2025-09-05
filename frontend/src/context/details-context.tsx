'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';

type DetailsItem = FileItem | Folder | null;

type Ctx = {
  isOpen: boolean;
  selectedItem: DetailsItem;
  open: (item: DetailsItem) => void;
  close: () => void;
  toggle: () => void;
};

const DetailsContext = createContext<Ctx | null>(null);

export const DetailsProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DetailsItem>(null);

  const open = (item: DetailsItem) => {
    setSelectedItem(item);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setSelectedItem(null);
  };

  const toggle = () => setIsOpen((p) => !p);

  return (
    <DetailsContext.Provider value={{ isOpen, selectedItem, open, close, toggle }}>
      {children}
    </DetailsContext.Provider>
  );
};

export const useDetails = () => {
  const ctx = useContext(DetailsContext);
  if (!ctx) throw new Error('useDetails must be used within DetailsProvider');
  return ctx;
};
