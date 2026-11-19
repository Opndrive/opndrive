'use client';

import { DriveHero } from '@/features/dashboard/components/views/home/drive-hero';
import { useScroll } from '@/context/scroll-context';
import { SuggestedFolders } from '@/features/dashboard/components/views/home/suggested-folders';
import { SuggestedFiles } from '@/features/dashboard/components/views/home/suggested-files';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { useDriveStore, useRecentState } from '@/context/data-context';
import { AsyncBoundary } from '@/shared/components/ui/async-boundary';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { useUploadDispatch } from '@/features/upload/hooks/use-upload-dispatch';
import { EmptyStateDropzone } from '@/features/dashboard/components/views/home/empty-state-dropzone';
import { useMultiSelectStore } from '@/features/dashboard/stores/use-multi-select-store';
import { MultiSelectToolbar } from '@/features/dashboard/components/ui/multi-select-toolbar';
import { useMultiShareDialog } from '@/features/dashboard/hooks/use-multi-share-dialog';
import { MultiShareDialog } from '@/features/dashboard/components/dialogs/multi-share-dialog';

/** Suggestions shown at first, and added by each "View more". */
const SUGGESTIONS_STEP = 10;

export default function HomePage() {
  const { isSearchHidden } = useScroll();
  const router = useRouter();
  // One selector per value rather than `useDriveStore()`, which subscribes to
  // the whole store: every listing write, for any prefix, re-rendered this page
  // and the whole tree of cards under it. The actions are stable references, so
  // selecting them costs nothing and never triggers a render on its own.
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const fetchData = useDriveStore((state) => state.fetchData);
  const setCurrentPrefix = useDriveStore((state) => state.setCurrentPrefix);
  const setRootPrefix = useDriveStore((state) => state.setRootPrefix);
  const setApiS3 = useDriveStore((state) => state.setApiS3);

  const dispatchDrop = useUploadDispatch();
  // How many suggestions to show. "View more" raises these; the suggestions
  // themselves are read off the folder's listing, not kept as a second copy.
  const [fileLimit, setFileLimit] = useState(SUGGESTIONS_STEP);
  const [folderLimit, setFolderLimit] = useState(SUGGESTIONS_STEP);
  const [isSyncing, setIsSyncing] = useState(false);
  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  const { isOpen, currentFiles, openMultiShareDialog, closeMultiShareDialog, generateShareLinks } =
    useMultiShareDialog();
  const { clearSelection, getSelectionCount } = useMultiSelectStore();

  // Was the same collapsed flag the browse page had, written out a second
  // time, with the same consequence: a failed fetch drew the skeleton.
  const recent = useRecentState(fileLimit, folderLimit);

  // Every hook lives above the early returns below. They used to sit after
  // them, so React saw a different number of hooks depending on whether the
  // session had loaded - the "rendered fewer hooks than expected" crash waiting
  // to happen. The ones that need a session guard internally instead.

  // Clear selection when multi-share dialog closes
  useEffect(() => {
    if (!isOpen) {
      clearSelection();
    }
  }, [isOpen, clearSelection]);

  useEffect(() => {
    if (apiS3) {
      setApiS3(apiS3);
    }
  }, [apiS3, setApiS3]);

  useEffect(() => {
    // Keyed on apiS3 rather than running once on mount: the early return used
    // to delay this until a session existed, so it has to wait for one now.
    if (!apiS3) return;

    const rootPrefix = apiS3.getPrefix();
    if (rootPrefix === '') {
      setRootPrefix('/');
      setCurrentPrefix('/');
    } else {
      setRootPrefix(rootPrefix);
      setCurrentPrefix(rootPrefix);
    }
  }, [apiS3, setRootPrefix, setCurrentPrefix]);

  useEffect(() => {
    if (currentPrefix) void fetchData();
  }, [currentPrefix, fetchData]);

  // Clear selection when returning to home page
  useEffect(() => {
    clearSelection();
  }, [clearSelection]); // clearSelection is a stable store action, so this still runs once

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

  const handleFilesDroppedToDirectoryWrapper = useCallback(
    async (processedData: ProcessedDragData) => {
      await dispatchDrop(processedData, currentPrefix ?? '', apiS3);
    },
    [dispatchDrop, apiS3, currentPrefix]
  );

  const handleFilesDroppedToFolderWrapper = useCallback(
    async (processedData: ProcessedDragData, targetFolder: DragDropTarget) => {
      await dispatchDrop(processedData, targetFolder.path, apiS3);
    },
    [dispatchDrop, apiS3]
  );

  if (isLoading) {
    return <DashboardLoading />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix && folder.name) {
      // Navigate to the folder using the enhanced browse route
      const url = generateFolderUrl({ prefix: `${folder.name}/` });
      router.push(url);
    }
  };

  const handleLoadMoreFiles = () => setFileLimit((limit) => limit + SUGGESTIONS_STEP);
  const handleLoadMoreFolders = () => setFolderLimit((limit) => limit + SUGGESTIONS_STEP);

  const handleSync = async () => {
    if (isSyncing || !currentPrefix) return;

    setIsSyncing(true);
    try {
      await fetchData({ sync: true });
    } catch (error) {
      console.error('Failed to sync data:', error);
    } finally {
      setIsSyncing(false);
    }
  };

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
          <AsyncBoundary
            state={recent}
            pending={
              <div className="mt-8">
                <DashboardLoading showFolders={true} showFiles={true} fileLayout="grid" />
              </div>
            }
          >
            {(recentData) => (
              <>
                {/* Folders Section */}
                {recentData.folders && recentData.folders.length > 0 && (
                  <SuggestedFolders
                    folders={recentData.folders}
                    onFolderClick={handleFolderClick}
                    onFilesDroppedToFolder={handleFilesDroppedToFolderWrapper}
                    onViewMore={handleLoadMoreFolders}
                    hasMore={recentData.hasMoreFolders}
                    className="mt-8"
                  />
                )}

                {/* Files Section - Always show to provide drop zone */}
                {(recentData.folders && recentData.folders.length > 0) ||
                (recentData.files && recentData.files.length > 0) ? (
                  <SuggestedFiles
                    files={recentData.files || []}
                    onFilesDropped={handleFilesDroppedToDirectoryWrapper}
                    onViewMore={handleLoadMoreFiles}
                    hasMore={recentData.hasMoreFiles}
                    className="mt-8"
                  />
                ) : (
                  /* Empty state only when both folders and files are empty */
                  <EmptyStateDropzone
                    onFilesDropped={handleFilesDroppedToDirectoryWrapper}
                    className="mt-8"
                  />
                )}
              </>
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
