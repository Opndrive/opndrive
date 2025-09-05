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
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  if (isMobile) {
    return <MobileDetailsDialog />;
  }

  return isOpen ? <DetailsSidebar /> : null;
};
