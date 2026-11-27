'use client';

import { useScroll } from '@/context/scroll-context';
import { DriveList } from '@/features/dashboard/components/views/drive/drive-list';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { useDriveStore, useDirectoryState, useCurrentListing } from '@/context/data-context';
import { entryCount } from '@/context/folder-listing';
import { AsyncBoundary } from '@/shared/components/ui/async-boundary';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useEffect, Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EnhancedFolderBreadcrumb } from '@/features/dashboard/components/layout/breadcrumb/enhanced-folder-breadcrumb';
import {
  parseFolderParams,
  prefixToPathSegments,
  buildFolderClickUrl,
  getFolderNameFromPrefix,
} from '@/features/folder-navigation/folder-navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { useUploadDispatch } from '@/features/upload/hooks/use-upload-dispatch';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { MultiSelectToolbar } from '@/features/dashboard/components/ui/multi-select-toolbar';
import { useMultiSelectStore } from '@/features/dashboard/stores/use-multi-select-store';
import { useMultiShareDialog } from '@/features/dashboard/hooks/use-multi-share-dialog';
import { MultiShareDialog } from '@/features/dashboard/components/dialogs/multi-share-dialog';

function BrowsePageContent() {
  const { setSearchHidden } = useScroll();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isSyncing, setIsSyncing] = useState(false);

  // One selector per value rather than `useDriveStore()`, which subscribes to
  // the whole store. The listing is this folder's alone; the rest are stable
  // actions, which never trigger a render of their own.
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const listing = useCurrentListing();
  const fetchData = useDriveStore((state) => state.fetchData);
  const loadMoreData = useDriveStore((state) => state.loadMoreData);
  const setCurrentPrefix = useDriveStore((state) => state.setCurrentPrefix);
  const setRootPrefix = useDriveStore((state) => state.setRootPrefix);
  const setApiS3 = useDriveStore((state) => state.setApiS3);

  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  const dispatchDrop = useUploadDispatch();

  const { isOpen, currentFiles, openMultiShareDialog, closeMultiShareDialog, generateShareLinks } =
    useMultiShareDialog();

  // Clear selection when clicking outside - only for single item selection
  const { clearSelection, getSelectionCount, selectAll } = useMultiSelectStore();

  // Clear selection when multi-share dialog closes
  useEffect(() => {
    if (!isOpen) {
      clearSelection();
    }
  }, [isOpen, clearSelection]);

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

  // The auth guards used to sit here, above roughly a dozen hooks, so React saw
  // a different hook count before and after the session resolved. They now run
  // once every hook has, just above the JSX.

  // Parse URL parameters using utility function
  const params = parseFolderParams(searchParams);
  const {
    prefix: prefixParam = '',
    maxKeys: _maxKeys,
    continuationToken: _continuationToken,
  } = params;

  // Convert prefix to path segments for breadcrumb
  const pathSegments = prefixToPathSegments(prefixParam);

  // Ensure search bar is visible in navbar when on browse page
  useEffect(() => {
    setSearchHidden(true); // true means navbar search is visible, home search is hidden
  }, [setSearchHidden]);

  // Set apiS3 in data store when it becomes available
  useEffect(() => {
    if (apiS3) {
      setApiS3(apiS3);
    }
  }, [apiS3, setApiS3]);

  useEffect(() => {
    // Guarded here now that the auth early return no longer stands between
    // this effect and a session that may not exist yet.
    if (!apiS3) return;

    const rootPrefix = apiS3.getPrefix();
    if (rootPrefix === '') {
      setRootPrefix('/');
    } else {
      setRootPrefix(rootPrefix);
    }

    // Set current prefix based on URL parameters
    const fullPrefix = rootPrefix === '' ? prefixParam : rootPrefix + prefixParam;
    const normalizedPrefix = fullPrefix || (rootPrefix === '' ? '/' : rootPrefix);

    setCurrentPrefix(normalizedPrefix);
  }, [apiS3, prefixParam, setCurrentPrefix, setRootPrefix]);

  useEffect(() => {
    if (currentPrefix) {
      fetchData({ sync: false });
    }
  }, [currentPrefix, fetchData]);

  // Clear selection when navigating to different folder
  useEffect(() => {
    clearSelection();
  }, [currentPrefix, clearSelection]);

  // Also clear selection when component mounts (navigating to browse page)
  useEffect(() => {
    clearSelection();
  }, [clearSelection]); // clearSelection is a stable store action, so this still runs once

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix) {
      const folderName = folder.name;
      if (folderName) {
        // Use utility function to build URL
        const url = buildFolderClickUrl(prefixParam, folderName);
        router.push(url);
      }
    }
  };

  const handleFilesDroppedToDirectoryWrapper = useCallback(
    async (processedData: ProcessedDragData) => {
      await dispatchDrop(processedData, currentPrefix ?? '', apiS3);
    },
    [currentPrefix, dispatchDrop, apiS3]
  );

  const handleFilesDroppedToFolderWrapper = useCallback(
    async (processedData: ProcessedDragData, targetFolder: DragDropTarget) => {
      await dispatchDrop(processedData, targetFolder.path, apiS3);
    },
    [dispatchDrop, apiS3]
  );

  const handleSync = async () => {
    if (isSyncing || !currentPrefix) return;

    setIsSyncing(true);
    try {
      await fetchData({ sync: true });
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // A union rather than an isReady flag. The flag collapsed 'error' into
  // 'not ready yet', so a listing that had failed drew the loading skeleton and
  // sat there for good.
  const directory = useDirectoryState();
  const currentData = listing?.loaded ? listing : null;

  // Entries loaded so far, hedged with a "+" until the last page is in. S3
  // never says how many keys a prefix holds, so there is no total to show
  // before then.
  const loadedCount = currentData ? entryCount(currentData) : 0;
  const countLabel = currentData?.complete
    ? `${loadedCount.toLocaleString()} item${loadedCount === 1 ? '' : 's'}`
    : `${loadedCount.toLocaleString()}+ items`;

  const handleLoadMore = useCallback(() => {
    void loadMoreData();
  }, [loadMoreData]);

  // Everything loaded, folders then files, the order both layouts draw.
  const selectAllOffer = currentData
    ? {
        loaded: loadedCount,
        complete: currentData.complete,
        onSelectAll: () => selectAll([...currentData.folders, ...currentData.files]),
      }
    : undefined;

  if (isLoading) {
    return <DashboardLoading />;
  }

  if (!isAuthenticated || !apiS3) {
    return null; // useAuthGuard will handle redirect
  }

  // Get current folder name for display using utility function
  const currentFolderName = getFolderNameFromPrefix(prefixParam) || 'My Drive';

  return (
    <>
      {pathSegments.length > 0 && (
        <EnhancedFolderBreadcrumb
          pathSegments={pathSegments}
          onNavigate={(prefix: string) => {
            const params = new URLSearchParams();
            if (prefix) {
              params.set('prefix', prefix);
            }

            const url = prefix ? `/dashboard/browse?${params.toString()}` : '/dashboard';
            router.push(url);
          }}
        />
      )}

      <div className="relative">
        <div className="sticky top-[-12px] sm:top-[-26px] z-10 bg-background mb-6">
          {/* Header with folder name and sync button */}
          <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-4 py-3 sm:py-4 px-1 sm:px-0 border-b border-border/30 sm:border-b-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-normal text-foreground break-words leading-tight sm:leading-normal">
                {currentFolderName}
              </h2>
              {loadedCount > 0 && (
                <span
                  data-testid="folder-count"
                  className="item-count-badge flex-shrink-0 self-start sm:self-auto"
                >
                  {countLabel}
                </span>
              )}
            </div>

            <AriaLabel label="Refresh files and folders" position="bottom">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-border/50 bg-background hover:bg-secondary/50 transition-all duration-200 ${
                  isSyncing ? 'cursor-not-allowed' : 'cursor-pointer hover:border-border'
                }`}
              >
                <HiOutlineRefresh
                  className={`w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform duration-300 ${
                    isSyncing ? 'animate-spin text-foreground' : 'hover:text-foreground'
                  }`}
                />
              </button>
            </AriaLabel>
          </div>

          {/* Multi-select toolbar - inside same sticky container, floats below header */}
          <div className="relative h-0">
            <div className="absolute top-0 left-0 right-0 z-20 bg-background">
              <MultiSelectToolbar
                openMultiShareDialog={openMultiShareDialog}
                selectAll={selectAllOffer}
              />
            </div>
          </div>
        </div>

        <div className="relative z-0 pt-2">
          {/* Show loading state or actual content */}
          <AsyncBoundary
            state={directory}
            pending={
              <div className="mt-8">
                <DashboardLoading showFolders={true} showFiles={true} fileLayout="grid" />
              </div>
            }
          >
            {(data) => (
              <DriveList
                folders={data.folders}
                files={data.files}
                complete={data.complete}
                nextPage={data.nextPage}
                onLoadMore={handleLoadMore}
                listingKey={currentPrefix ?? undefined}
                initialScrollOffset={data.scrollOffset}
                label={`Contents of ${currentFolderName}`}
                onFolderClick={handleFolderClick}
                onFilesDropped={handleFilesDroppedToDirectoryWrapper}
                onFilesDroppedToFolder={handleFilesDroppedToFolderWrapper}
              />
            )}
          </AsyncBoundary>
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

export default function BrowsePage() {
  return (
    <Suspense fallback={<DashboardLoading showFolders={true} showFiles={true} fileLayout="grid" />}>
      <BrowsePageContent />
    </Suspense>
  );
}
