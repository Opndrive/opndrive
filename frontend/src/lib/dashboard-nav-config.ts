import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { MdHomeFilled } from 'react-icons/md';
import { LuBook } from 'react-icons/lu';
import { FaFolder, FaUsers } from 'react-icons/fa';
import { IoMdTime } from 'react-icons/io';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

const adminNavItems: NavItem[] = [
  {
    title: 'Home',
    href: '/',
    icon: MdHomeFilled,
  },
  {
    title: 'My Drive',
    href: '/user',
    icon: LuBook,
    children: [
      {
        title: 'Folder 1',
        href: '/user/add',
        icon: FaFolder,
      },
    ],
  },
  {
    title: 'Shared with me',
    href: '/reports',
    icon: FaUsers,
  },
  {
    title: 'Recents',
    href: '/settings',
    icon: IoMdTime,
  },
];

const sevadarNavItems: NavItem[] = [
  {
    title: 'Sevadar Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
];

export function getNavItems(role: string): NavItem[] {
  if (role === 'admin') {
    return adminNavItems;
  }
  if (role === 'sevadar') {
    return sevadarNavItems;
  }
  return [];
}
