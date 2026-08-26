import { MdHomeFilled } from 'react-icons/md';
import { PiHardDrivesFill } from 'react-icons/pi';
import type { SidebarItem } from '@/features/dashboard/components/layout/sidebar/types/sidebar';

/**
 * This file used to declare its own `SidebarItem`, structurally similar to the
 * one the sidebar components use but missing `badge` and `disabled`. Two
 * descriptions of the same shape, and only one of them was ever updated. The
 * components own the type; this file supplies the data for it.
 */
export type { SidebarItem };

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
