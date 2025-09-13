'use client';

import { ViewLayout } from '@/features/dashboard/types/file';
import { List, Grid3X3 } from 'lucide-react';
import { useLayoutPreference } from '@/hooks/use-layout-preference';

interface LayoutToggleProps {
  onLayoutChange?: (layout: ViewLayout) => void; // Made optional since we'll handle it internally
  className?: string;
}

export function LayoutToggle({ onLayoutChange, className = '' }: LayoutToggleProps) {
  const { layout, setLayout, isLoaded } = useLayoutPreference();

  const handleLayoutChange = (newLayout: ViewLayout) => {
    setLayout(newLayout);
    onLayoutChange?.(newLayout); // Call parent callback if provided
  };

  // Prevent hydration mismatch by not rendering until loaded
  if (!isLoaded) {
    return (
      <div className={`flex rounded-lg bg-secondary p-1 ${className}`}>
        <div className="flex items-center justify-center rounded-md px-2 py-1">
          <div className="h-4 w-4 animate-pulse bg-muted-foreground/20 rounded" />
        </div>
        <div className="flex items-center justify-center rounded-md px-2 py-1">
          <div className="h-4 w-4 animate-pulse bg-muted-foreground/20 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex rounded-lg bg-secondary p-1 ${className}`}>
      <button
        onClick={() => handleLayoutChange('list')}
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
        onClick={() => handleLayoutChange('grid')}
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
