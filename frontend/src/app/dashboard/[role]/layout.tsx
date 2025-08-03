'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getNavItems } from '@/lib/dashboard-nav-config';
import NotFound from '@/app/not-found';
import { VALID_ROLES } from '@/lib/auth-config';
import LoadingBar from '@/components/loading-bar';
import { DashboardNavbar } from '@/components/dashboard/layout/navbar/dashboard-navbar';
import { DashboardSidebar } from '@/components/dashboard/layout/sidebar/dashboard-sidebar';
import { ScrollProvider } from '@/context/scroll-context';
import { DetailsProvider, useDetails } from '@/context/details-context';
import { DetailsSidebar } from '@/components/ui/dashboard/details-sidebar/details-sidebar';

const LayoutShell = ({ children }: { children: React.ReactNode }) => {
  const params = useParams();
  const [role, setRole] = useState('');
  const [paramsLoaded, setParamsLoaded] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const r = typeof params.role === 'string' ? params.role.toLowerCase() : '';
    setRole(r);
    setParamsLoaded(true);
  }, [params]);

  const isValidRole = useMemo(() => VALID_ROLES.includes(role), [role]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const lsKey = useMemo(() => `sidebarOpen_${role}`, [role]);

  useEffect(() => {
    if (!isValidRole || !paramsLoaded) return;
    const saved = localStorage.getItem(lsKey);
    if (saved !== null) setIsSidebarOpen(saved === 'true');
    else if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, [lsKey, isValidRole, paramsLoaded]);

  const toggleSidebar = () => {
    if (!isValidRole) return;
    setIsSidebarOpen((p) => {
      const n = !p;
      localStorage.setItem(lsKey, n.toString());
      return n;
    });
  };

  const closeSidebar = () => {
    if (!isValidRole || window.innerWidth >= 1024) return;
    setIsSidebarOpen(false);
    localStorage.setItem(lsKey, 'false');
  };

  const navItems = useMemo(() => getNavItems(role), [role]);
  const basePath = useMemo(() => `/dashboard/${role}`, [role]);
  const { isOpen: detailsOpen } = useDetails();

  if (!paramsLoaded)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg">Loading.</div>
      </div>
    );

  if (!isValidRole) return <NotFound />;

  return (
    <div className="flex h-screen flex-col bg-secondary">
      <LoadingBar />

      <DashboardNavbar toggleSidebar={toggleSidebar} role={role} />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebar
          isOpen={isSidebarOpen}
          closeSidebar={closeSidebar}
          navItems={navItems}
          basePath={basePath}
          role={role}
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
