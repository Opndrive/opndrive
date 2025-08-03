import React from 'react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
  badge?: string | number;
  disabled?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: NavItem[];
  showSeparator?: boolean;
}

export interface DashboardSidebarProps {
  isOpen: boolean;
  closeSidebar: () => void;
  navItems: NavItem[];
  basePath: string;
  role: string;
}

export interface SidebarItemProps {
  item: NavItem;
  basePath: string;
  isActive: (href: string) => boolean;
  onItemClick: () => void;
  isInDropdown?: boolean;
}

export interface SidebarDropdownProps {
  item: NavItem;
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
