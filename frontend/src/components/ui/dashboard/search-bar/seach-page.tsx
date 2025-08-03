'use client';

import { useState } from 'react';
import { SearchBar } from './search-bar';
import { AdvancedSearchSheet } from './advance-search-sheet/advanced-search-sheet';

export const SearchPage = () => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <>
      <div className="relative flex w-full items-center px-4">
        <SearchBar withAdvanced onAdvancedClick={() => setIsAdvancedOpen(true)} />
      </div>

      <AdvancedSearchSheet isOpen={isAdvancedOpen} onClose={() => setIsAdvancedOpen(false)} />
    </>
  );
};
