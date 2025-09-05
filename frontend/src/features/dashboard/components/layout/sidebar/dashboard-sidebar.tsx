'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/utils';
import { DashboardSidebarProps } from './types/sidebar';
import { SidebarCreateButton } from './sidebar-create-button';
import { SidebarItem } from './sidebar-item';
import { SidebarDropdown } from './sidebar-dropdown';
import { groupSidebarItems } from './utils/sidebar';

export function DashboardSidebar({
  isOpen,
  closeSidebar,
  sidebarItems,
  basePath,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Removed role-based key; use a stable key (optionally include basePath to scope it per app/space)
  const localStorageKey = useMemo(
    () => `dashboard_sidebar_state${basePath ? `:${basePath}` : ''}`,
    [basePath]
  );

  const sidebarSections = useMemo(() => groupSidebarItems(sidebarItems), [sidebarItems]);

  useEffect(() => {
    function checkScreenSize() {
      setIsSmallScreen(window.innerWidth < 1024);
    }
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  useEffect(() => {
    if (isOpen && isSmallScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isSmallScreen]);

  useEffect(() => {
    const initialOpenSections: Record<string, boolean> = {};
    sidebarItems.forEach((item) => {
      if (item.children) {
        const isActive = item.children.some((child) => {
          const childFullPath = `${basePath}${child.href === '/' ? '' : child.href}`;
          return pathname === childFullPath || pathname.startsWith(childFullPath + '/');
        });
        if (isActive) {
          initialOpenSections[item.title] = true;
        }
      }
    });
    const savedOpenSections = localStorage.getItem(localStorageKey);
    if (!savedOpenSections && Object.keys(initialOpenSections).length > 0) {
      setOpenSections(initialOpenSections);
    }
  }, [pathname, sidebarItems, basePath, localStorageKey]);

  useEffect(() => {
    if (Object.keys(openSections).length > 0) {
      localStorage.setItem(localStorageKey, JSON.stringify(openSections));
    }
  }, [openSections, localStorageKey]);

  useEffect(() => {
    const savedOpenSections = localStorage.getItem(localStorageKey);
    if (savedOpenSections) {
      try {
        setOpenSections(JSON.parse(savedOpenSections));
      } catch {
        // Reset sidebar state if corrupted
        localStorage.removeItem(localStorageKey);
      }
    }
  }, [localStorageKey]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const isActive = (itemHref: string) => {
    const fullPath = `${basePath}${itemHref === '/' ? '' : itemHref}`;
    if (itemHref === '/') {
      return pathname === fullPath;
    }
    return pathname === fullPath || pathname.startsWith(fullPath + '/');
  };

  const handleMenuItemClick = () => {
    if (isSmallScreen) {
      closeSidebar();
    }
  };

  const handleCreateClick = () => {};

  return (
    <>
      {isOpen && isSmallScreen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}
      <div
        ref={sidebarRef}
        className={cn(
          'bg-secondary flex flex-col z-50 h-[calc(100vh-3.5rem)] fixed lg:relative left-0 w-64 overflow-x-hidden',
          'transition-all duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          isOpen ? 'lg:w-64' : 'lg:w-0'
        )}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3">
          {/* Create Button */}
          <SidebarCreateButton onClick={handleCreateClick} />

          {/* Navigation Sections */}
          {sidebarSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {/* Separator */}
              {section.showSeparator && <div className="border-t border-border my-4" />}

              {/* Section Items */}
              <div className="space-y-1 mb-4">
                {section.items.map((item) =>
                  item.children ? (
                    <SidebarDropdown
                      key={item.title}
                      item={item}
                      isOpen={!!openSections[item.title]}
                      onToggle={() => toggleSection(item.title)}
                      basePath={basePath}
                      isActive={isActive}
                      onItemClick={handleMenuItemClick}
                    />
                  ) : (
                    <SidebarItem
                      key={item.title}
                      item={item}
                      basePath={basePath}
                      isActive={isActive}
                      onItemClick={handleMenuItemClick}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        <div
          className={cn(
            'shrink-0 transition-opacity duration-200',
            isOpen ? 'opacity-100' : 'opacity-0'
          )}
        ></div>
      </div>
    </>
  );
}
