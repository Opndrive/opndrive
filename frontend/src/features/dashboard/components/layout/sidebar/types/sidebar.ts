import React from 'react';

export interface SidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: SidebarItem[];
  badge?: string | number;
  disabled?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
  showSeparator?: boolean;
}

export interface DashboardSidebarProps {
  isOpen: boolean;
  closeSidebar: () => void;
  sidebarItems: SidebarItem[];
  basePath: string;
}

export interface SidebarItemProps {
  item: SidebarItem;
  basePath: string;
  isActive: (href: string) => boolean;
  onItemClick: () => void;
  isInDropdown?: boolean;
}

export interface SidebarDropdownProps {
  item: SidebarItem;
  isOpen: boolean;
  onToggle: () => void;
  basePath: string;
  isActive: (href: string) => boolean;
  onItemClick: () => void;
}

export interface SidebarStorageProps {
  used: number;
  total: number;
  onGetMoreStorage?: () => void;
}
