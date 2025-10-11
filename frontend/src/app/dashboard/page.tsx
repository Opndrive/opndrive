'use client';

import { DriveHero } from '@/features/dashboard/components/views/home/drive-hero';
import { useScroll } from '@/context/scroll-context';
import { SuggestedFolders } from '@/features/dashboard/components/views/home/suggested-folders';
import { SuggestedFiles } from '@/features/dashboard/components/views/home/suggested-files';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { useDriveStore } from '@/context/data-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { EmptyStateDropzone } from '@/features/dashboard/components/views/home/empty-state-dropzone';
import { useMultiSelectStore } from '@/features/dashboard/stores/use-multi-select-store';
import { MultiSelectToolbar } from '@/features/dashboard/components/ui/multi-select-toolbar';
import { useMultiShareDialog } from '@/features/dashboard/hooks/use-multi-share-dialog';
import { MultiShareDialog } from '@/features/dashboard/components/dialogs/multi-share-dialog';

export default function HomePage() {
  const { isSearchHidden } = useScroll();
  const router = useRouter();
  const {
    currentPrefix,
    recentCache,
    recentStatus,
    fetchRecentItems,
    loadMoreRecentFiles,
    loadMoreRecentFolders,
    setCurrentPrefix,
    setRootPrefix,
    setApiS3,
  } = useDriveStore();

  const { handleFilesDroppedToDirectory, handleFilesDroppedToFolder } = useUploadStore();
  const [isLoadingMoreFiles, setIsLoadingMoreFiles] = useState(false);
  const [isLoadingMoreFolders, setIsLoadingMoreFolders] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { apiS3, uploadManager, isLoading, isAuthenticated } = useAuthGuard();

  const { isOpen, currentFiles, openMultiShareDialog, closeMultiShareDialog, generateShareLinks } =
    useMultiShareDialog();
  const { clearSelection, getSelectionCount } = useMultiSelectStore();

  // Clear selection when multi-share dialog closes
  useEffect(() => {
    if (!isOpen) {
      clearSelection();
    }
  }, [isOpen, clearSelection]);

  if (isLoading) {
    return <DashboardLoading />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  useEffect(() => {
    if (apiS3) {
      setApiS3(apiS3);
    }
  }, [apiS3, setApiS3]);

  useEffect(() => {
    const rootPrefix = apiS3.getPrefix();
    if (rootPrefix === '') {
      setRootPrefix('/');
      setCurrentPrefix('/');
    } else {
      setRootPrefix(rootPrefix);
      setCurrentPrefix(rootPrefix);
    }
  }, []);

  useEffect(() => {
    if (currentPrefix) fetchRecentItems({ sync: false, itemsPerType: 10 });
  }, [currentPrefix]);

  // Clear selection when returning to home page
  useEffect(() => {
    clearSelection();
  }, []); // Empty dependency array - runs once on mount

  // Clear selection when clicking outside - only for single item selection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Only clear if exactly one item is selected
      if (
        getSelectionCount() === 1 &&
        !target.closest('[data-file-item]') &&
        !target.closest('[data-folder-item]') &&
        !target.closest('[data-multi-select-toolbar]')
      ) {
        clearSelection();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [clearSelection, getSelectionCount]);

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix && folder.name) {
      // Navigate to the folder using the enhanced browse route
      const url = generateFolderUrl({
        prefix: `${folder.name}/`,
        key: folder.name,
      });
      router.push(url);
    }
  };

  const handleFilesDroppedToDirectoryWrapper = useCallback(
    async (processedData: ProcessedDragData) => {
      await handleFilesDroppedToDirectory(processedData, currentPrefix, apiS3, uploadManager);
    },
    [currentPrefix, handleFilesDroppedToDirectory, apiS3, uploadManager]
  );

  const handleFilesDroppedToFolderWrapper = useCallback(
    async (processedData: ProcessedDragData, targetFolder: DragDropTarget) => {
      await handleFilesDroppedToFolder(
        processedData,
        targetFolder,
        currentPrefix,
        apiS3,
        uploadManager
      );
    },
    [currentPrefix, handleFilesDroppedToFolder, apiS3, uploadManager]
  );

  const handleLoadMoreFiles = async () => {
    setIsLoadingMoreFiles(true);
    try {
      await loadMoreRecentFiles();
    } finally {
      setIsLoadingMoreFiles(false);
    }
  };

  const handleLoadMoreFolders = async () => {
    setIsLoadingMoreFolders(true);
    try {
      await loadMoreRecentFolders();
    } finally {
      setIsLoadingMoreFolders(false);
    }
  };

  const handleSync = async () => {
    if (isSyncing || !currentPrefix) return;

    setIsSyncing(true);
    try {
      await fetchRecentItems({ sync: true, itemsPerType: 10 });
    } catch (error) {
      console.error('Failed to sync data:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const isReady = currentPrefix ? recentStatus[currentPrefix] === 'ready' : false;
  const recentData = currentPrefix ? recentCache[currentPrefix] : null;

  return (
    <>
      <DriveHero />
      <div className="relative">
        {/* Sticky header container - Welcome text and toolbar move together */}
        <div className="sticky top-[-20px] md:top-[-24px] z-10 bg-background">
          {/* Welcome text and Sync button - Only visible when scrolling */}
          <div
            className={`flex items-center justify-between gap-4 py-4 transition-all duration-300 ${
              isSearchHidden
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-2 pointer-events-none'
            }`}
          >
            <h2 className="text-2xl font-normal text-foreground">Welcome to Opndrive</h2>

            {/* Sync Button */}
            <AriaLabel
              label={isSyncing ? 'Refreshing data...' : 'Refresh data to sync latest changes'}
              position="bottom"
            >
              <button
                onClick={handleSync}
                disabled={isSyncing || !currentPrefix}
                className="flex items-center justify-center p-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <HiOutlineRefresh
                  className={`w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground group-hover:text-foreground transition-all duration-200 ${
                    isSyncing ? 'animate-spin' : ''
                  }`}
                />
              </button>
            </AriaLabel>
          </div>

          {/* Multi-select toolbar - inside same sticky container to move together */}
          <div className="relative h-0">
            <div
              className={`absolute left-0 right-0 bg-background transition-all duration-300 ${
                isSearchHidden ? 'top-0' : 'top-2'
              }`}
            >
              <MultiSelectToolbar openMultiShareDialog={openMultiShareDialog} />
            </div>
          </div>
        </div>

        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady && recentData ? (
            <>
              {/* Folders Section */}
              {recentData.folders && recentData.folders.length > 0 && (
                <SuggestedFolders
                  folders={recentData.folders}
                  onFolderClick={handleFolderClick}
                  onFilesDroppedToFolder={handleFilesDroppedToFolderWrapper}
                  onViewMore={handleLoadMoreFolders}
                  hasMore={recentData.hasMoreFolders}
                  isLoadingMore={isLoadingMoreFolders}
                  className="mt-8"
                />
              )}

              {/* Files Section */}
              {recentData.files && recentData.files.length > 0 && (
                <SuggestedFiles
                  files={recentData.files}
                  onFilesDropped={handleFilesDroppedToDirectoryWrapper}
                  onViewMore={handleLoadMoreFiles}
                  hasMore={recentData.hasMoreFiles}
                  isLoadingMore={isLoadingMoreFiles}
                  className="mt-8"
                />
              )}

              {/* Empty state when no folders or files */}
              {(!recentData.folders || recentData.folders.length === 0) &&
                (!recentData.files || recentData.files.length === 0) && (
                  <EmptyStateDropzone
                    onFilesDropped={handleFilesDroppedToDirectoryWrapper}
                    className="mt-8"
                  />
                )}
            </>
          ) : (
            <div className="mt-8">
              <DashboardLoading showFolders={true} showFiles={true} fileLayout="grid" />
            </div>
          )}
        </div>
      </div>

      {/* Multi-share dialog */}
      <MultiShareDialog
        files={currentFiles}
        isOpen={isOpen}
        onClose={closeMultiShareDialog}
        generateShareLinks={generateShareLinks}
      />
    </>
  );
}
