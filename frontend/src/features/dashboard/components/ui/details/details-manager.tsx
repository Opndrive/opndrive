'use client';

import { useEffect, useState } from 'react';
import { DetailsSidebar } from './details-sidebar';
import { MobileDetailsDialog } from './mobile-details-dialog';
import { useDetails } from '@/context/details-context';

export const DetailsManager = () => {
  const [isMobile, setIsMobile] = useState(false);
  const { isOpen } = useDetails();

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Don't render anything if details aren't open
  if (!isOpen) return null;

  if (isMobile) {
    return <MobileDetailsDialog />;
  }

  // Desktop version - render in absolute positioned container
  return (
    <div className="absolute right-2 top-2 bottom-2 w-80 z-10">
      <div className="h-full rounded-2xl lg:rounded-3xl border border-border/20 bg-background overflow-hidden shadow-lg">
        <DetailsSidebar />
      </div>
    </div>
  );
};
