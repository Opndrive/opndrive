'use client';

import { useRef, useEffect } from 'react';
import { SearchBar } from '@/features/dashboard/components/views/search/search-bar';
import { useScroll } from '@/context/scroll-context';

interface DriveHeroProps {
  showWelcome?: boolean;
  title?: string;
}

export const DriveHero = ({ showWelcome = true, title }: DriveHeroProps) => {
  const { isSearchHidden, setSearchHidden } = useScroll();

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = searchRef.current;
    if (!s) return;

    const searchObs = new IntersectionObserver(([e]) => setSearchHidden(!e.isIntersecting), {
      threshold: 0,
    });

    searchObs.observe(s);

    return () => {
      searchObs.disconnect();
    };
  }, [setSearchHidden]);

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10"></div>
      {showWelcome && (
        <h1 className="mb-6 text-center text-2xl font-normal text-foreground">
          {title || 'Welcome to Opndrive'}
        </h1>
      )}
      <div
        ref={searchRef}
        className={`mx-auto max-w-2xl transition-all duration-300 ${isSearchHidden ? 'opacity-0 -translate-y-8 scale-95 pointer-events-none' : 'opacity-100 translate-y-0 scale-100'}`}
      >
        <SearchBar />
      </div>
    </div>
  );
};
