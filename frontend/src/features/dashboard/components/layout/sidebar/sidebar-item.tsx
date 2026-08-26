import React from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/utils';
import { sidebarBadgeClasses, sidebarRowClasses } from '@/shared/utils/sidebar-row';
import { SidebarItemProps } from './types/sidebar';

export const SidebarItem: React.FC<SidebarItemProps> = ({
  item,
  basePath,
  isActive,
  onItemClick,
  isInDropdown = false,
}) => {
  const itemFullPath = `${basePath}${item.href === '/' ? '' : item.href}`;
  // A row that cannot be navigated to is not the current page, whatever the
  // route says.
  const itemIsActive = !item.disabled && isActive(item.href);

  const rowContent = (
    <>
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
        aria-hidden="true"
        className={cn(
          'flex-shrink-0 mr-3',
          isInDropdown ? 'h-4 w-4' : 'h-5 w-5',
          itemIsActive && 'text-primary-foreground'
        )}
      />
      <span className="truncate">{item.title}</span>
      {/*
        `!= null` rather than a truthiness check: `badge` is `string | number`,
        and `{item.badge && ...}` renders a bare `0` next to the label for a
        zero count instead of the pill.
      */}
      {item.badge != null && (
        <span className={sidebarBadgeClasses({ isActive: itemIsActive })}>{item.badge}</span>
      )}
    </>
  );

  // Rendered as a span, not a disabled link: HTML has no disabled state for an
  // anchor, and an <a> without href is still in the accessibility tree as a
  // link. This is out of the tab order and announced as disabled.
  if (item.disabled) {
    return (
      <span
        aria-disabled="true"
        className={sidebarRowClasses({ isNested: isInDropdown, isDisabled: true })}
      >
        {rowContent}
      </span>
    );
  }

  return (
    <Link
      href={itemFullPath}
      onClick={onItemClick}
      aria-current={itemIsActive ? 'page' : undefined}
      className={sidebarRowClasses({ isActive: itemIsActive, isNested: isInDropdown })}
    >
      {rowContent}
    </Link>
  );
};
