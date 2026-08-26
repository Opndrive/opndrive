import React from 'react';

export interface SidebarItem {
  title: string;
  href: string;
  /**
   * Typed as full SVG props rather than `{ className?: string }` so the row can
   * mark the icon `aria-hidden`. Both icon sets in use - `react-icons` and
   * `lucide-react` - render an `<svg>` and accept its attributes.
   */
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children?: SidebarItem[];
  badge?: string | number;
  /** Renders the row non-interactive: no navigation, no focus, `aria-disabled`. */
  disabled?: boolean;
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
