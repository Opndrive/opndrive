'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import Image from 'next/image';
import NavbarUserProfile from './navbar-user-profile';
import { useScroll } from '@/context/scroll-context';
import { SearchPage } from '../../views';

interface DashboardNavbarProps {
  toggleSidebar: () => void;
}

export function DashboardNavbar({ toggleSidebar }: DashboardNavbarProps) {
  const { isSearchHidden } = useScroll();

  return (
    <header className="sticky top-0 z-30 w-full bg-secondary px-6 py-2">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center">
          <div className="lg:hidden flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="mr-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </Button>
            <Image
              src="/logo-nobg.png"
              width={40}
              height={40}
              className="h-10 w-auto"
              alt="Organization Logo"
            />
          </div>

          <div className="flex items-center gap-3">
            <Image src="/logo-nobg.png" alt="Opndrive" width={32} height={32} className="h-8 w-8" />
            <h1 className="text-xl font-bold text-foreground">Opndrive</h1>
          </div>

          <div className="hidden lg:block">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="ml-4 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 justify-center px-4">
          <div
            className={`w-full max-w-2xl transition-all duration-300 ${
              isSearchHidden
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
            }`}
          >
            <SearchPage />
          </div>
        </div>

        <NavbarUserProfile />
      </div>
    </header>
  );
}
