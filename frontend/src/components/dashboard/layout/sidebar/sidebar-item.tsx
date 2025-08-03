import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SidebarItemProps } from './types/sidebar';

export const SidebarItem: React.FC<SidebarItemProps> = ({
  item,
  basePath,
  isActive,
  onItemClick,
  isInDropdown = false,
}) => {
  const itemFullPath = `${basePath}${item.href === '/' ? '' : item.href}`;
  const itemIsActive = isActive(item.href);

  return (
    <Link
      href={itemFullPath}
      onClick={onItemClick}
      className={cn(
        'flex items-center w-full text-sm transition-all duration-200 ease-in-out group',
        isInDropdown ? 'px-3 py-2 ml-6 rounded-lg' : 'px-3 py-2 rounded-lg',
        itemIsActive
          ? 'bg-primary text-primary-foreground font-medium shadow-sm'
          : 'text-secondary-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 mr-3',
          isInDropdown ? 'h-4 w-4' : 'h-5 w-5',
          itemIsActive && 'text-primary-foreground'
        )}
      >
        <item.icon />
      </div>
      <span className="truncate">{item.title}</span>
      {item.badge && (
        <span
          className={cn(
            'ml-auto text-xs px-2 py-1 rounded-full',
            itemIsActive
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
};
