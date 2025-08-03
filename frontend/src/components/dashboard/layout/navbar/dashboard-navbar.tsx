'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import NavbarUserProfile from './navbar-user-profile';
import { useScroll } from '@/context/scroll-context';
import { SearchPage } from '@/components/ui/dashboard/search-bar/seach-page';

interface DashboardNavbarProps {
  toggleSidebar: () => void;
  role: string;
}

export function DashboardNavbar({ toggleSidebar, role }: DashboardNavbarProps) {
  const { isSearchHidden } = useScroll();

  return (
    <header className="sticky top-0 z-30 w-full bg-secondary px-6 py-2">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center">
          <div className="lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="mr-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </Button>
          </div>
          <div className="hidden items-center space-x-2 lg:flex">
            <Image
              src="/logo-nobg.png"
              width={50}
              height={50}
              className="h-10 w-auto"
              alt="Organization Logo"
            />
            <span className="mr-2 text-xl font-medium text-foreground">
              Opn<span className="text-primary">drive</span>
            </span>
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
            className={`w-full max-w-2xl transition-all duration-300 ${isSearchHidden ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`}
          >
            <SearchPage />
          </div>
        </div>

        <NavbarUserProfile role={role} />
      </div>
    </header>
  );
}
