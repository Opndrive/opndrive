import React, { useId } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { sidebarBadgeClasses, sidebarRowClasses } from '@/shared/utils/sidebar-row';
import { SidebarDropdownProps } from './types/sidebar';
import { SidebarItem } from './sidebar-item';

export const SidebarDropdown: React.FC<SidebarDropdownProps> = ({
  item,
  isOpen,
  onToggle,
  basePath,
  isActive,
  onItemClick,
}) => {
  const panelId = useId();
  const itemIsActive = isActive(item.href);
  const hasActiveChild = item.children?.some((child) => isActive(child.href));
  const isHighlighted = itemIsActive || !!hasActiveChild;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={sidebarRowClasses({ isActive: isHighlighted })}
      >
        <div className="flex items-center flex-1 min-w-0">
          {/* Same fix as SidebarItem: the size belongs on the icon, and the
              row is already centring its children. */}
          <item.icon
            aria-hidden="true"
            className={cn('flex-shrink-0 mr-3 h-5 w-5', isHighlighted && 'text-primary-foreground')}
          />
          <span className="truncate">{item.title}</span>
          {item.badge != null && (
            <span className={sidebarBadgeClasses({ isActive: isHighlighted })}>{item.badge}</span>
          )}
        </div>
        <div className="flex-shrink-0 ml-2">
          {isOpen ? (
            <ChevronUp aria-hidden="true" className="w-4 h-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="w-4 h-4" />
          )}
        </div>
      </button>

      {/*
        Rendered whether or not it is open, and hidden with the `hidden`
        attribute rather than unmounted, so the id `aria-controls` points at
        always resolves. `hidden` keeps the collapsed children out of the tab
        order and out of the accessibility tree.
      */}
      <div id={panelId} hidden={!isOpen} className="mt-2 space-y-1">
        {item.children?.map((child) => (
          <SidebarItem
            key={child.href}
            item={child}
            basePath={basePath}
            isActive={isActive}
            onItemClick={onItemClick}
            isInDropdown={true}
          />
        ))}
      </div>
    </div>
  );
};
