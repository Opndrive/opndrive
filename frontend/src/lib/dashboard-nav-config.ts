import React from 'react';
import { MdHomeFilled } from 'react-icons/md';
import { LuBook } from 'react-icons/lu';
import { FaUsers } from 'react-icons/fa';
import { IoMdTime } from 'react-icons/io';

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
  {
    title: 'Shared with me',
    href: '/shared',
    icon: FaUsers,
  },
  {
    title: 'Recents',
    href: '/recent',
    icon: IoMdTime,
  },
];

export function getNavItems(): NavItem[] {
  return NavItems;
}
