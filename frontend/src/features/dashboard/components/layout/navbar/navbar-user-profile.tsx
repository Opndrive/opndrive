'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { ThemeToggle } from '@/shared/components/layout/ThemeToggle';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { assets } from '@/assets';

const user = {
  firstName: 'John Doe',
  email: 'user@user.com',
  avatarImg: assets.userIcon.src,
};

const NavbarUserProfile = () => {
  return (
    <div className="hover:cursor-pointer flex items-center space-x-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Avatar className="h-8 w-8 bg-card rounded-full">
            <AvatarImage src={user.avatarImg} />
            <AvatarFallback>{user.firstName.toUpperCase()}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56 bg-secondary border-border" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user?.firstName || user?.email}</p>
              <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="focus:bg-accent p-0">
            <div className="flex justify-center w-full py-1">
              <ThemeToggle />
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <Link href={`/dashboard/settings`} passHref>
            <DropdownMenuItem className="cursor-pointer ">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default NavbarUserProfile;
