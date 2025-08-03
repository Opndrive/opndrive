import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarCreateButtonProps {
  onClick?: () => void;
  className?: string;
}

export const SidebarCreateButton: React.FC<SidebarCreateButtonProps> = ({ onClick, className }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center w-full px-4 py-3 mb-4 text-sm font-medium',
        'bg-card text-card-foreground border border-border',
        'rounded-2xl shadow-sm hover:shadow-md transition-all duration-200',
        'hover:bg-accent hover:text-foreground',
        className
      )}
    >
      <Plus className="w-5 h-5 mr-3 flex-shrink-0" />
      <span>New</span>
    </button>
  );
};
