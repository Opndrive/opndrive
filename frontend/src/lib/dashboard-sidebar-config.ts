import React from 'react';
import { MdHomeFilled } from 'react-icons/md';
import { PiHardDrivesFill } from 'react-icons/pi';

export interface SidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: SidebarItem[];
}

const SidebarItems: SidebarItem[] = [
  {
    title: 'Home',
    href: '/',
    icon: MdHomeFilled,
  },
  {
    title: 'My Drive',
    href: '/browse',
    icon: PiHardDrivesFill,
  },
];

export function getSidebarItems(): SidebarItem[] {
  return SidebarItems;
}
