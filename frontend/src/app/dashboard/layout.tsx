'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getNavItems } from '@/lib/dashboard-nav-config';
import LoadingBar from '@/components/loading-bar';
import { DashboardNavbar } from '@/components/dashboard/layout/navbar/dashboard-navbar';
import { DashboardSidebar } from '@/components/dashboard/layout/sidebar/dashboard-sidebar';
import { ScrollProvider } from '@/context/scroll-context';
import { DetailsProvider, useDetails } from '@/context/details-context';
import { DetailsSidebar } from '@/components/ui/dashboard/details-sidebar/details-sidebar';

const LayoutShell = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [paramsLoaded, setParamsLoaded] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // Sidebar localStorage key without role
  const lsKey = useMemo(() => `sidebarOpen_global`, []);

  useEffect(() => {
    const saved = localStorage.getItem(lsKey);
    if (saved !== null) {
      setIsSidebarOpen(saved === 'true');
    } else if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    setParamsLoaded(true);
  }, [lsKey]);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(lsKey, next.toString());
      return next;
    });
  };

  const closeSidebar = () => {
    if (window.innerWidth >= 1024) return;
    setIsSidebarOpen(false);
    localStorage.setItem(lsKey, 'false');
  };

  // No role — just get all nav items
  const navItems = useMemo(() => getNavItems(), []);
  const basePath = '/dashboard';
  const { isOpen: detailsOpen } = useDetails();

  if (!paramsLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden flex-col bg-secondary">
      <LoadingBar />

      <DashboardNavbar toggleSidebar={toggleSidebar} />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebar
          isOpen={isSidebarOpen}
          closeSidebar={closeSidebar}
          navItems={navItems}
          basePath={basePath}
        />

        <div
          className={`flex flex-1 flex-col min-h-0 lg:mb-4 ${detailsOpen ? 'lg:mr-2' : 'lg:mr-4'} ${
            !isSidebarOpen ? 'lg:ml-4' : ''
          }`}
        >
          <div className="flex flex-1 flex-col min-h-0 rounded-3xl border border-border/20 bg-background">
            <div className="rounded-t-3xl overflow-hidden" />
            <main
              ref={mainRef}
              className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 scroll-smooth custom-scrollbar"
            >
              {children}
            </main>
          </div>
        </div>

        {detailsOpen && <DetailsSidebar />}
      </div>
    </div>
  );
};

export default function DynamicDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScrollProvider>
      <DetailsProvider>
        <LayoutShell>{children}</LayoutShell>
      </DetailsProvider>
    </ScrollProvider>
  );
}
