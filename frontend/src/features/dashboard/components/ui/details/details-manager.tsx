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

  return (
    <div className="w-80 xl:w-96 flex-shrink-0">
      <DetailsSidebar />
    </div>
  );
};
