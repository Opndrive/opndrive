'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
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
    <header
      className={`sticky top-0 z-30 w-full bg-secondary px-4 sm:px-6 transition-all duration-300 ease-in-out ${
        showMobileSearch
          ? 'py-2 min-h-[3.5rem]' // Full height when search is visible
          : 'py-1.5 md:py-2 min-h-[3rem] md:min-h-[3.5rem]' // Compact height on mobile when no search
      }`}
    >
      {/* Desktop and Tablet Navbar (md and up - 768px+) */}
      <div className="hidden md:flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Image src="/logo-nobg.png" alt="Opndrive" width={32} height={32} className="h-8 w-8" />
            <h1 className="text-xl font-bold text-foreground">Opndrive</h1>
          </Link>
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

        <div className="flex flex-1 justify-center">
          <div
            className={`transition-all duration-300 ${
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

      {/* Mobile Navbar (sm and below - <768px) */}
      <div
        className={`md:hidden relative transition-all duration-300 ease-in-out ${
          showMobileSearch ? 'min-h-[3rem]' : 'min-h-[2.5rem]'
        }`}
      >
        {/* Initial State - Hamburger + Logo + Profile */}
        <div
          className={`flex w-full items-center justify-between transition-all duration-300 ease-in-out ${
            showMobileSearch
              ? 'opacity-0 transform -translate-y-2 pointer-events-none absolute inset-0'
              : 'opacity-100 transform translate-y-0 relative'
          }`}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className={`text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-300 ${
                showMobileSearch ? 'h-10 w-10' : 'h-9 w-9'
              }`}
              aria-label="Toggle Sidebar"
            >
              <Menu size={18} />
            </Button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/logo-nobg.png"
                width={28}
                height={28}
                className={`transition-all duration-300 ${
                  showMobileSearch ? 'h-8 w-8' : 'h-7 w-7'
                }`}
                alt="Opndrive Logo"
              />
              <h1
                className={`font-semibold text-foreground transition-all duration-300 ${
                  showMobileSearch ? 'text-lg' : 'text-base'
                }`}
              >
                Opndrive
              </h1>
            </Link>
          </div>
          <div
            className={`transition-all duration-300 ${showMobileSearch ? 'scale-100' : 'scale-90'}`}
          >
            <NavbarUserProfile />
          </div>
        </div>

        {/* Search State - Animated Search Bar */}
        <div
          className={`flex w-full items-center gap-3 transition-all duration-300 ease-in-out ${
            showMobileSearch
              ? 'opacity-100 transform translate-y-0 relative'
              : 'opacity-0 transform translate-y-2 pointer-events-none absolute inset-0'
          }`}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="flex-shrink-0 h-10 w-10 text-muted-foreground hover:bg-accent hover:text-foreground"
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
