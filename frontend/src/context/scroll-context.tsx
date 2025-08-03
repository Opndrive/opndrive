'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ScrollContextType {
  isHeaderHidden: boolean;
  isSearchHidden: boolean;
  isFiltersHidden: boolean;
  setHeaderHidden: (v: boolean) => void;
  setSearchHidden: (v: boolean) => void;
  setFiltersHidden: (v: boolean) => void;
}

const ScrollContext = createContext<ScrollContextType | undefined>(undefined);

export const useScroll = () => {
  const c = useContext(ScrollContext);
  if (!c) throw new Error('useScroll must be used within a ScrollProvider');
  return c;
};

export const ScrollProvider = ({ children }: { children: ReactNode }) => {
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isSearchHidden, setIsSearchHidden] = useState(false);
  const [isFiltersHidden, setIsFiltersHidden] = useState(false);

  const setHeaderHidden = useCallback((v: boolean) => setIsHeaderHidden(v), []);
  const setSearchHidden = useCallback((v: boolean) => setIsSearchHidden(v), []);
  const setFiltersHidden = useCallback((v: boolean) => setIsFiltersHidden(v), []);

  return (
    <ScrollContext.Provider
      value={{
        isHeaderHidden,
        isSearchHidden,
        isFiltersHidden,
        setHeaderHidden,
        setSearchHidden,
        setFiltersHidden,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
};
