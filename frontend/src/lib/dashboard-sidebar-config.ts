import React from 'react';
import { MdHomeFilled } from 'react-icons/md';
import { LuBook } from 'react-icons/lu';

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
    icon: LuBook,
  },
];

export function getSidebarItems(): SidebarItem[] {
  return SidebarItems;
}
