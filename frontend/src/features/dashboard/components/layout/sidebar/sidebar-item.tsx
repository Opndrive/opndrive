import React from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/utils';
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
      {/*
        Sized on the icon, not on a box around it.

        `react-icons` default to a width and height of 1em, so an icon given no
        size of its own inherits the `text-sm` on the row and draws at 14px.
        The wrapper it used to sit in reserved 20, and Tailwind's preflight
        makes an svg `display: block`, so those 14px sat in the top left corner
        of that 20px box. The row centred the box; nothing centred the icon
        inside it. That is why it looked both small and high.

        The row is already `flex items-center`, so as a direct child the icon is
        centred by the row and there is no box left to be the wrong size.
      */}
      <item.icon
        className={cn(
          'flex-shrink-0 mr-3',
          isInDropdown ? 'h-4 w-4' : 'h-5 w-5',
          itemIsActive && 'text-primary-foreground'
        )}
      />
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
