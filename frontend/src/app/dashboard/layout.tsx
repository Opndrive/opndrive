'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { DetailsManager } from '@/features/dashboard/components/ui/details/details-manager';
import { FilePreviewModal } from '@/components/file-preview';
import { RenameModalManager } from '@/features/dashboard/components/ui/dialogs/rename-modal-manager';
import { ShareModalManager } from '@/features/dashboard/components/ui/dialogs/share-modal-manager';
import { UploadCard } from '@/features/upload';
import { DownloadProgressManager } from '@/features/dashboard/components/ui/download-progress-manager';
import { useAuth, useApiS3 } from '@/hooks/use-auth';
import { useDriveStore } from '@/context/data-context';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { useNotification } from '@/context/notification-context';
import { useUploadHandler } from '@/features/upload/hooks/use-upload-handler';

const DragAndDropWrapper = ({ children }: { children: React.ReactNode }) => {
  const { currentPrefix } = useDriveStore();
  const apiS3 = useApiS3();
  const { settings, isLoaded } = useSettings();
  const { showNotification } = useNotification();

  // Initialize upload handlers using hooks properly (only if apiS3 is available)
  const uploadHandlerResult = apiS3
    ? useUploadHandler(
        {
          currentPath: currentPrefix || '',
          uploadMethod: isLoaded ? settings.general.uploadMethod : 'auto',
        },
        apiS3
      )
    : { handleFileUpload: null, handleFolderUpload: null };

  const { handleFileUpload, handleFolderUpload } = uploadHandlerResult;

  // Handle files dropped to the current directory
  const handleFilesDroppedToDirectory = useCallback(
    async (files: File[], folders: File[], targetPath: string) => {
      if (!apiS3 || !isLoaded || !handleFileUpload || !handleFolderUpload) {
        showNotification('error', 'Upload system not ready');
        return;
      }

      try {
        // Handle regular files
        if (files.length > 0) {
          await handleFileUpload(files);
          showNotification(
            'success',
            `Started upload of ${files.length} file${files.length !== 1 ? 's' : ''} to ${targetPath}`
          );
        }

        // Handle folder files
        if (folders.length > 0) {
          await handleFolderUpload(folders);
          showNotification(
            'success',
            `Started upload of folder contents (${folders.length} files) to ${targetPath}`
          );
        }
      } catch (error) {
        console.error('Drag and drop upload error:', error);
        showNotification('error', 'Failed to start upload');
      }
    },
    [apiS3, isLoaded, handleFileUpload, handleFolderUpload, showNotification]
  );

  // Handle files dropped to a specific folder
  const handleFilesDroppedToFolder = useCallback(
    async (files: File[], folders: File[], targetFolder: DragDropTarget) => {
      if (!apiS3 || !isLoaded || !handleFileUpload || !handleFolderUpload) {
        showNotification('error', 'Upload system not ready');
        return;
      }

      try {
        // Calculate the proper target path: currentPrefix + targetFolder.name + '/'
        let targetPath;
        if (currentPrefix && currentPrefix !== '/') {
          // If we have a current prefix, append the folder name to it
          targetPath = currentPrefix.endsWith('/')
            ? `${currentPrefix}${targetFolder.name}/`
            : `${currentPrefix}/${targetFolder.name}/`;
        } else {
          // If we're at root, just use the folder name
          targetPath = `${targetFolder.name}/`;
        }

        if (files.length > 0) {
          // Use the upload handler with the target path override
          await handleFileUpload(files, targetPath);
        }

        if (folders.length > 0) {
          await handleFolderUpload(folders, targetPath);
        }
      } catch (error) {
        console.error('Folder drop upload error:', error);
        showNotification('error', `Failed to upload to folder "${targetFolder.name}"`);
      }
    },
    [apiS3, isLoaded, handleFileUpload, handleFolderUpload, showNotification, currentPrefix]
  );

  // Don't render drag zone if upload system isn't ready
  if (!apiS3 || !isLoaded || !handleFileUpload || !handleFolderUpload) {
    return <>{children}</>;
  }

  const callbacks = {
    onFilesDroppedToDirectory: handleFilesDroppedToDirectory,
    onFilesDroppedToFolder: handleFilesDroppedToFolder,
  };

  return (
    <EnhancedDragDropProvider callbacks={callbacks} currentPath={currentPrefix || 'My Drive'}>
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
