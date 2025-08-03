import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const itemIsActive = isActive(item.href);
  const hasActiveChild = item.children?.some((child) => isActive(child.href));

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center w-full px-3 py-2 text-sm rounded-lg transition-all duration-200 ease-in-out group',
          itemIsActive || hasActiveChild
            ? 'bg-primary text-primary-foreground font-medium shadow-sm'
            : 'text-secondary-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <div className="flex items-center flex-1 min-w-0">
          <div
            className={cn(
              'flex-shrink-0 mr-3 h-5 w-5',
              (itemIsActive || hasActiveChild) && 'text-primary-foreground'
            )}
          >
            <item.icon />
          </div>
          <span className="truncate">{item.title}</span>
          {item.badge && (
            <span
              className={cn(
                'ml-2 text-xs px-2 py-1 rounded-full',
                itemIsActive || hasActiveChild
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {item.badge}
            </span>
          )}
        </div>
        <div className="flex-shrink-0 ml-2">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && item.children && (
        <div className="mt-2 space-y-1">
          {item.children.map((child) => (
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
      )}
    </div>
  );
};
