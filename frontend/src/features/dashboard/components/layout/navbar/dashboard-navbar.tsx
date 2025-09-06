'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import Image from 'next/image';
import NavbarUserProfile from './navbar-user-profile';
import { useScroll } from '@/context/scroll-context';
import { SearchPage } from '../../views';
import { useEffect, useState } from 'react';

interface DashboardNavbarProps {
  toggleSidebar: () => void;
}

export function DashboardNavbar({ toggleSidebar }: DashboardNavbarProps) {
  const { isSearchHidden } = useScroll();
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          // Show search when scrolling down more than 50px
          setShowMobileSearch(currentScrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-30 w-full bg-secondary px-4 sm:px-6 py-2">
      {/* Desktop Navbar */}
      <div className="hidden lg:flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/logo-nobg.png" alt="Opndrive" width={32} height={32} className="h-8 w-8" />
          <h1 className="text-xl font-bold text-foreground">Opndrive</h1>
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

      {/* Mobile Navbar */}
      <div className="lg:hidden">
        {/* Initial State - Hamburger + Profile */}
        <div
          className={`flex w-full items-center justify-between transition-all duration-300 ease-in-out ${
            showMobileSearch
              ? 'opacity-0 transform -translate-y-2 pointer-events-none absolute'
              : 'opacity-100 transform translate-y-0'
          }`}
        >
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </Button>
            <Image
              src="/logo-nobg.png"
              width={32}
              height={32}
              className="h-8 w-8"
              alt="Opndrive Logo"
            />
            <h1 className="text-lg font-semibold text-foreground">Opndrive</h1>
          </div>
          <NavbarUserProfile />
        </div>

        {/* Search State - Animated Search Bar */}
        <div
          className={`flex w-full items-center gap-3 transition-all duration-300 ease-in-out ${
            showMobileSearch
              ? 'opacity-100 transform translate-y-0'
              : 'opacity-0 transform translate-y-2 pointer-events-none absolute'
          }`}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="flex-shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Toggle Sidebar"
          >
            <Menu size={20} />
          </Button>

          <div className="flex-1 max-w-none">
            <SearchPage />
          </div>

          <div className="flex-shrink-0">
            <NavbarUserProfile />
          </div>
        </div>
      </div>
    </header>
  );
}
