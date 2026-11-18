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
import { LogOut, Settings } from 'lucide-react';
import { assets } from '@/assets';
import { useAuth } from '@/hooks/use-auth';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';

const user = {
  firstName: 'John Doe',
  email: 'user@user.com',
  avatarImg: assets.userIcon.src,
};

const NavbarUserProfile = () => {
  const { clearSession, connections } = useAuth();

  /**
   * Clear Session signs this browser out: the session and every saved
   * connection, keys included. With only the one connection that is what
   * anyone expects; with more, it is said first, because the others go too.
   */
  const handleClearSession = async () => {
    if (connections.length > 1) {
      const confirmed = await confirmAction({
        title: 'Clear session?',
        description: `This signs you out and removes all ${connections.length} saved connections and their keys from this browser.\nYour buckets and the files in them are not touched.`,
        confirmLabel: 'Clear session',
        destructive: true,
      });

      if (!confirmed) return;
    }

    clearSession();
  };

  return (
    <div className="hover:cursor-pointer flex items-center space-x-4">
      <DropdownMenu>
        {/* A real button: the avatar on its own is a span, which the
            keyboard never reaches, and with it Settings and Clear Session. */}
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
          >
            <Avatar className="h-8 w-8 bg-card rounded-full">
              <AvatarImage src={user.avatarImg} alt="" />
              <AvatarFallback>{user.firstName.toUpperCase()}</AvatarFallback>
            </Avatar>
          </button>
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

          {/* clearSession navigates to / itself once the session is gone. */}
          <DropdownMenuItem className="cursor-pointer" onSelect={() => void handleClearSession()}>
            <LogOut className="w-4 h-4 mr-2" />
            Clear Session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default NavbarUserProfile;
