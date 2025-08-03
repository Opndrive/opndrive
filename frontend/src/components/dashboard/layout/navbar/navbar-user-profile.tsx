'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { LogOut, Settings } from 'lucide-react';

interface DashboardNavbarProps {
  role: string;
}

const NavbarUserProfile = ({ role }: DashboardNavbarProps) => {
  const { user, logout } = useAuth();

  return (
    <div className="hover:cursor-pointer flex items-center space-x-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Avatar className="h-8 w-8 bg-card rounded-full">
            <AvatarImage src={user?.avatar ?? ''} alt={user?.email ?? 'User Avatar'} />
            <AvatarFallback>{(user?.email?.charAt(0) ?? 'U').toUpperCase()}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56 bg-secondary border-border" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user?.firstName ||
                  user?.email ||
                  `${role.charAt(0).toUpperCase() + role.slice(1)} User`}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.email || `${role}@example.com`}
              </p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="focus:bg-accent p-0">
            <div className="flex justify-center w-full py-1">
              <ThemeToggle />
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <Link href={`/dashboard/${role}/settings`} passHref>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
          </Link>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => logout()}
            className=" focus:bg-red-600 focus:text-white cursor-pointer"
          >
            <LogOut className="hover:text-white w-4 h-4 mr-2" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default NavbarUserProfile;
