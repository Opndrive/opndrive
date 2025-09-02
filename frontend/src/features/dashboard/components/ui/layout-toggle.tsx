'use client';

import { ViewLayout } from '@/features/dashboard/types/file';
import { List, Grid3X3 } from 'lucide-react';

interface LayoutToggleProps {
  layout: ViewLayout;
  onLayoutChange: (layout: ViewLayout) => void;
  className?: string;
}

export function LayoutToggle({ layout, onLayoutChange, className = '' }: LayoutToggleProps) {
  return (
    <div className={`flex rounded-lg bg-secondary p-1 ${className}`}>
      <button
        onClick={() => onLayoutChange('list')}
        className={`flex items-center justify-center rounded-md px-2 py-1 text-sm transition-colors ${
          layout === 'list'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="List view"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        onClick={() => onLayoutChange('grid')}
        className={`flex items-center justify-center rounded-md px-2 py-1 text-sm transition-colors ${
          layout === 'grid'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="Grid view"
      >
        <Grid3X3 className="h-4 w-4" />
      </button>
    </div>
  );
}
