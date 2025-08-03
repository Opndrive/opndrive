'use client';

import { Grid3x3, List, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

type View = 'grid' | 'list';

interface ViewToggleProps {
  view: View;
  onViewChange: (view: View) => void;
  onInfoClick: () => void;
}

export const ViewToggle = ({ view, onViewChange, onInfoClick }: ViewToggleProps) => {
  return (
    <div className="flex items-center gap-1 bg-secondary p-1 rounded-full">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onViewChange('grid')}
        className={`rounded-full w-8 h-8 ${
          view === 'grid'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="Grid View"
      >
        <Grid3x3 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onViewChange('list')}
        className={`rounded-full w-8 h-8 ${
          view === 'list'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="List View"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onInfoClick}
        className="text-muted-foreground hover:text-foreground rounded-full w-8 h-8"
        aria-label="View Details"
      >
        <Info className="w-4 h-4" />
      </Button>
    </div>
  );
};
