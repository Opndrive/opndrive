import React, { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { CreateMenu } from '../../ui';

interface SidebarCreateButtonProps {
  onClick?: () => void;
  className?: string;
}

export const SidebarCreateButton: React.FC<SidebarCreateButtonProps> = ({ onClick, className }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    console.log('Button clicked, current menu state:', isMenuOpen); // Debug log
    setIsMenuOpen(!isMenuOpen);

    // Call the optional onClick if provided
    if (onClick) {
      onClick();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
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

      <CreateMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        anchorElement={buttonRef.current}
      />
    </>
  );
};
