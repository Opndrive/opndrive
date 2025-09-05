import React from 'react';
import { MdHomeFilled } from 'react-icons/md';
import { LuBook } from 'react-icons/lu';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

const NavItems: NavItem[] = [
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

export function getNavItems(): NavItem[] {
  return NavItems;
}
