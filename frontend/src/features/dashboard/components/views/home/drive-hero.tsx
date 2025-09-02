'use client';

import { useRef, useEffect } from 'react';
import { SearchBar } from '@/features/dashboard/components/views/search/search-bar';
import { useScroll } from '@/context/scroll-context';
import { ViewDetails } from '@/features/dashboard/components/ui/details/view-details';
import { FilterBar } from '@/features/dashboard/components/views/search/filter-bar';

interface DriveHeroProps {
  showWelcome?: boolean;
  showFilters?: boolean;
  title?: string;
}

export const DriveHero = ({ showWelcome = true, showFilters = true, title }: DriveHeroProps) => {
  const { isSearchHidden, isFiltersHidden, setSearchHidden, setFiltersHidden } = useScroll();

  const searchRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = searchRef.current;
    const f = filtersRef.current;
    if (!s || !f) return;

    const searchObs = new IntersectionObserver(([e]) => setSearchHidden(!e.isIntersecting), {
      threshold: 0,
    });
    const filtersObs = new IntersectionObserver(([e]) => setFiltersHidden(!e.isIntersecting), {
      threshold: 0,
    });

    searchObs.observe(s);
    filtersObs.observe(f);

    return () => {
      searchObs.disconnect();
      filtersObs.disconnect();
    };
  }, [setSearchHidden, setFiltersHidden]);

  return (
    <div className="relative mb-8">
      <div className="absolute right-0 top-0 z-10">
        <ViewDetails />
      </div>
      {showWelcome && (
        <h1
          className={`mb-6 text-center text-2xl font-normal text-foreground transition-all duration-300 ${isFiltersHidden ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}
        >
          {title || 'Welcome to Opndrive'}
        </h1>
      )}
      <div
        ref={searchRef}
        className={`mx-auto mb-6 max-w-2xl transition-all duration-300 ${isSearchHidden ? 'opacity-0 -translate-y-8 scale-95 pointer-events-none' : 'opacity-100 translate-y-0 scale-100'}`}
      >
        <SearchBar />
      </div>
      {showFilters && (
        <FilterBar
          ref={filtersRef}
          className={
            isFiltersHidden
              ? 'opacity-0 -translate-y-4 pointer-events-none'
              : 'opacity-100 translate-y-0'
          }
        />
      )}
    </div>
  );
};
