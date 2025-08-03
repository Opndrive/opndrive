'use client';

import { Info } from 'lucide-react';
import { useDetails } from '@/context/details-context';

export const ViewDetails = () => {
  const { isOpen, toggle } = useDetails();

  return (
    <div
      aria-label="View details"
      onClick={toggle}
      className={`p-2   cursor-pointer 
        ${
          isOpen
            ? ' text-background rounded-2xl bg-primary '
            : ' hover:bg-accent hover:rounded-2xl '
        }`}
    >
      <Info className="h-5 w-5" />
    </div>
  );
};
