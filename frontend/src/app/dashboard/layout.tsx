'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getSidebarItems } from '@/lib/dashboard-sidebar-config';
import LoadingBar from '@/shared/components/layout/loading-bar';
import { DashboardNavbar } from '@/features/dashboard/components/layout/navbar/dashboard-navbar';
import { DashboardSidebar } from '@/features/dashboard/components/layout/sidebar/dashboard-sidebar';
import { ScrollProvider } from '@/context/scroll-context';
import { DetailsProvider, useDetails } from '@/context/details-context';
import { FilePreviewProvider } from '@/context/file-preview-context';
import { RenameProvider } from '@/context/rename-context';
import { ShareProvider } from '@/context/share-context';
import { EnhancedDragDropProvider } from '@/features/upload/providers/enhanced-drag-drop-provider';
import { DragDetectionWrapper } from '@/features/upload/components/drag-detection-wrapper';
import { DetailsManager } from '@/features/dashboard/components/ui/details/details-manager';
import { FilePreviewModal } from '@/components/file-preview';
import { RenameModalManager } from '@/features/dashboard/components/ui/dialogs/rename-modal-manager';
import { ShareModalManager } from '@/features/dashboard/components/ui/dialogs/share-modal-manager';
import { DownloadProgressManager } from '@/features/dashboard/components/ui/download-progress-manager';
import { useAuth } from '@/hooks/use-auth';
import { useDriveStore } from '@/context/data-context';
import { UploadCard } from '@/features/upload/components/upload-card';

const DragAndDropWrapper = ({ children }: { children: React.ReactNode }) => {
  const { currentPrefix } = useDriveStore();

  return (
    <EnhancedDragDropProvider currentPath={currentPrefix || 'My Drive'}>
      <DragDetectionWrapper>{children}</DragDetectionWrapper>
    </EnhancedDragDropProvider>
  );
};

const LayoutShell = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [paramsLoaded, setParamsLoaded] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const { userCreds, isLoading } = useAuth();

  // Check if we're on the settings page
  const isSettingsPage = pathname?.startsWith('/dashboard/settings');

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

  // No role — just get all sidebar items
  const sidebarItems = useMemo(() => getSidebarItems(), []);
  const basePath = '/dashboard';
  const { isOpen: detailsOpen } = useDetails();

  // 🚨 Block dashboard rendering until auth is resolved
  if (isLoading || !paramsLoaded || !userCreds) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  // If we're on settings page, let the settings layout handle everything
  if (isSettingsPage) {
    return (
      <div className="flex h-screen overflow-hidden flex-col bg-secondary">
        <LoadingBar />
        {children}
      </div>
    );
  }

  // Normal dashboard layout
  return (
    <div className="flex h-screen overflow-hidden flex-col bg-secondary">
      <LoadingBar />

      <DashboardNavbar toggleSidebar={toggleSidebar} />

      <div className="flex flex-1 min-h-0 relative">
        <DashboardSidebar
          isOpen={isSidebarOpen}
          closeSidebar={closeSidebar}
          sidebarItems={sidebarItems}
          basePath={basePath}
        />

        {/* Main content area - absolute positioned to take full available space */}
        <div
          className={`
          absolute inset-0 flex flex-col min-h-0 min-w-0 
          transition-all duration-200 ease-in-out
          ${isSidebarOpen ? 'lg:left-64' : 'lg:left-0'}
           sm:p-3 lg:p-4
          ${detailsOpen ? 'lg:pr-[21rem]' : ''}
        `}
        >
          <div className="flex flex-1 flex-col min-h-0 min-w-0 rounded-2xl lg:rounded-3xl border border-border/20 bg-background overflow-hidden">
            <main
              ref={mainRef}
              className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 min-h-0 scroll-smooth custom-scrollbar"
            >
              <DragAndDropWrapper>{children}</DragAndDropWrapper>
            </main>
          </div>
        </div>

        {/* Details panel - managed by single responsive component */}
        <DetailsManager />
      </div>

      <UploadCard />

      <DownloadProgressManager />

      <FilePreviewModal />

      <RenameModalManager />

      <ShareModalManager />
    </div>
  );
};

export default function DynamicDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScrollProvider>
      <DetailsProvider>
        <FilePreviewProvider>
          <RenameProvider>
            <ShareProvider>
              <LayoutShell>{children}</LayoutShell>
            </ShareProvider>
          </RenameProvider>
        </FilePreviewProvider>
      </DetailsProvider>
    </ScrollProvider>
  );
}
