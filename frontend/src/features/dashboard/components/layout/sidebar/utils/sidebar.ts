import { NavItem, SidebarSection } from '../types/sidebar';

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const calculateUsagePercentage = (used: number, total: number): number => {
  return Math.round((used / total) * 100);
};

export const groupNavItems = (navItems: NavItem[]): SidebarSection[] => {
  return [
    {
      items: navItems,
      showSeparator: false,
    },
  ];
};

export const getStorageKeyForRole = (role: string): string => {
  return `sidebarOpenSections_${role}`;
};
