'use client';

import { Search, SlidersHorizontal } from 'lucide-react';

interface Props {
  withAdvanced?: boolean;
  onAdvancedClick?: () => void;
}

export const SearchBar = ({ withAdvanced = false, onAdvancedClick }: Props) => (
  <div className="relative w-full">
    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

    <input
      type="text"
      placeholder="Search in Drive"
      className={`w-full rounded-full border border-border bg-input py-3 pl-12 ${
        withAdvanced ? 'pr-12' : 'pr-4'
      } text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none `}
    />

    {withAdvanced && (
      <button
        type="button"
        onClick={onAdvancedClick}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors hover:bg-border"
        aria-label="Advanced search"
      >
        <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
      </button>
    )}
  </div>
);
