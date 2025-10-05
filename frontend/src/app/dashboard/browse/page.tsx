'use client';

import { useScroll } from '@/context/scroll-context';
import { SuggestedFolders } from '@/features/dashboard/components/views/home/suggested-folders';
import { SuggestedFiles } from '@/features/dashboard/components/views/home/suggested-files';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { FileItem } from '@/features/dashboard/types/file';
import { useDriveStore } from '@/context/data-context';
import { useApiS3 } from '@/hooks/use-auth';
import { useEffect, Suspense, useState, useCallback, useRef } from 'react';
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
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';

function BrowsePageContent() {
  const { setSearchHidden } = useScroll();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Chunked display state
  const [visibleFileChunks, setVisibleFileChunks] = useState(1); // Start with 1 chunk (100 items)
  const [visibleFolderChunks, setVisibleFolderChunks] = useState(1);
  const [isLoadingMoreChunks, setIsLoadingMoreChunks] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const CHUNK_SIZE = 100; // Display 100 items per chunk

  const {
    currentPrefix,
    cache,
    status,
    loadMoreStatus,
    fetchData,
    loadMoreData,
    setCurrentPrefix,
    setRootPrefix,
    setApiS3,
  } = useDriveStore();

  const apiS3 = useApiS3();

  const { handleFilesDroppedToDirectory, handleFilesDroppedToFolder } = useUploadStore();

  if (!apiS3) {
    return 'Loading...';
  }

  // Parse URL parameters using utility function
  const params = parseFolderParams(searchParams);
  const {
    prefix: prefixParam = '',
    key: keyParam = '',
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
    if (!apiS3) return; // Wait for apiS3 to be available

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

  // Reset chunks when data changes (new folder)
  useEffect(() => {
    setVisibleFileChunks(1);
    setVisibleFolderChunks(1);
  }, [currentPrefix]);

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix) {
      const folderName = folder.name;
      if (folderName) {
        // Use utility function to build URL
        const url = buildFolderClickUrl(prefixParam, folderName, keyParam);
        router.push(url);
      }
    }
  };

  const handleFolderMenuClick = (_folder: Folder, _event: React.MouseEvent) => {};

  const handleFileClick = (_file: FileItem) => {};

  const handleFileAction = (_action: string, _file: FileItem) => {};

  const handleFilesDroppedToDirectoryWrapper = useCallback(
    async (processedData: ProcessedDragData) => {
      await handleFilesDroppedToDirectory(processedData, currentPrefix, apiS3);
    },
    [currentPrefix, handleFilesDroppedToDirectory, apiS3]
  );

  const handleFilesDroppedToFolderWrapper = useCallback(
    async (processedData: ProcessedDragData, targetFolder: DragDropTarget) => {
      await handleFilesDroppedToFolder(processedData, targetFolder, currentPrefix, apiS3);
    },
    [currentPrefix, handleFilesDroppedToFolder, apiS3]
  );

  const handleSync = async () => {
    if (isSyncing || !currentPrefix) return;

    setIsSyncing(true);
    try {
      await fetchData({ sync: true });
      // Reset chunks to show fresh data from the beginning
      setVisibleFileChunks(1);
      setVisibleFolderChunks(1);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const isReady = currentPrefix ? status[currentPrefix] === 'ready' : false;
  const isLoadingMore = currentPrefix ? loadMoreStatus[currentPrefix] === 'loading' : false;
  const currentData = currentPrefix ? cache[currentPrefix] : null;

  // Calculate item counts and chunked data
  const allFolders = currentData?.folders || [];
  const allFiles = currentData?.files || [];

  // Calculate how many items to show based on chunks
  const maxVisibleFiles = visibleFileChunks * CHUNK_SIZE;
  const maxVisibleFolders = visibleFolderChunks * CHUNK_SIZE;

  // Get the actual items to display (chunked)
  const displayedFolders = allFolders.slice(0, maxVisibleFolders);
  const displayedFiles = allFiles.slice(0, maxVisibleFiles);

  const totalVisibleItems = displayedFolders.length + displayedFiles.length;
  const hasMoreItems = currentData?.isTruncated || false;

  // Check if we can load more chunks from cache
  const canLoadMoreFileChunks = allFiles.length > maxVisibleFiles;
  const canLoadMoreFolderChunks = allFolders.length > maxVisibleFolders;
  const canLoadMoreChunks = canLoadMoreFileChunks || canLoadMoreFolderChunks;

  // Intersection Observer for loading more chunks (professional approach)
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Only create observer if we can load more chunks and not currently loading
    if (!canLoadMoreChunks || isLoadingMoreChunks) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (entry.isIntersecting && !isLoadingMoreChunks) {
          setIsLoadingMoreChunks(true);

          // Load next chunk
          setTimeout(() => {
            if (canLoadMoreFileChunks && canLoadMoreFolderChunks) {
              // Load both if both have more
              setVisibleFileChunks((prev) => prev + 1);
              setVisibleFolderChunks((prev) => prev + 1);
            } else if (canLoadMoreFileChunks) {
              setVisibleFileChunks((prev) => prev + 1);
            } else if (canLoadMoreFolderChunks) {
              setVisibleFolderChunks((prev) => prev + 1);
            }
            setIsLoadingMoreChunks(false);
          }, 300);
        }
      },
      {
        // Trigger when the sentinel is 200px away from being visible
        rootMargin: '200px 0px',
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
      observer.disconnect();
    };
  }, [canLoadMoreChunks, canLoadMoreFileChunks, canLoadMoreFolderChunks, isLoadingMoreChunks]);

  // Manual function to load more chunks
  const loadMoreChunks = useCallback(() => {
    if (isLoadingMoreChunks || !canLoadMoreChunks) return;

    setIsLoadingMoreChunks(true);

    setTimeout(() => {
      if (canLoadMoreFileChunks && canLoadMoreFolderChunks) {
        // Load both if both have more
        setVisibleFileChunks((prev) => prev + 1);
        setVisibleFolderChunks((prev) => prev + 1);
      } else if (canLoadMoreFileChunks) {
        setVisibleFileChunks((prev) => prev + 1);
      } else if (canLoadMoreFolderChunks) {
        setVisibleFolderChunks((prev) => prev + 1);
      }
      setIsLoadingMoreChunks(false);
    }, 300);
  }, [isLoadingMoreChunks, canLoadMoreChunks, canLoadMoreFileChunks, canLoadMoreFolderChunks]);

  // Get current folder name for display using utility function
  const currentFolderName = getFolderNameFromPrefix(prefixParam) || 'My Drive';

  return (
    <>
      {pathSegments.length > 0 && (
        <EnhancedFolderBreadcrumb
          pathSegments={pathSegments}
          currentKey={keyParam}
          onNavigate={(prefix: string, key?: string) => {
            const params = new URLSearchParams();
            if (prefix) {
              params.set('prefix', prefix);
            }
            if (key) {
              params.set('key', key);
            }

            const url = prefix || key ? `/dashboard/browse?${params.toString()}` : '/dashboard';
            router.push(url);
          }}
        />
      )}

      <div className="relative">
        <div className="sticky top-[-12px] sm:top-[-26px] z-10 flex items-start sm:items-center justify-between gap-3 sm:gap-4 py-3 sm:py-4 px-1 sm:px-0 bg-background border-b border-border/30 sm:border-b-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-normal text-foreground break-words leading-tight sm:leading-normal">
              {currentFolderName}
            </h2>
            {totalVisibleItems > 0 && (
              <span className="item-count-badge flex-shrink-0 self-start sm:self-auto">
                {hasMoreItems || canLoadMoreChunks
                  ? `Showing ${totalVisibleItems.toLocaleString()}+ items`
                  : `${totalVisibleItems.toLocaleString()} item${totalVisibleItems === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-border/50 bg-background hover:bg-secondary/50 transition-all duration-200 ${
              isSyncing ? 'cursor-not-allowed' : 'cursor-pointer hover:border-border'
            }`}
            title="Refresh files and folders"
            aria-label="Refresh files and folders"
          >
            <HiOutlineRefresh
              className={`w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform duration-300 ${
                isSyncing ? 'animate-spin text-foreground' : 'hover:text-foreground'
              }`}
            />
          </button>
        </div>

        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady ? (
            <>
              {/* Folders */}
              <SuggestedFolders
                folders={displayedFolders}
                onFolderClick={handleFolderClick}
                onFolderMenuClick={handleFolderMenuClick}
                onFilesDroppedToFolder={handleFilesDroppedToFolderWrapper}
                className="mt-8"
                hideTitle={pathSegments.length > 0}
              />

              {/* Files */}
              <SuggestedFiles
                files={displayedFiles}
                onFileClick={handleFileClick}
                onFileAction={handleFileAction}
                onFilesDropped={handleFilesDroppedToDirectoryWrapper}
                className="mt-8"
                hideTitle={pathSegments.length > 0}
              />

              {/* Invisible sentinel element for Intersection Observer - only render when chunks available */}
              {canLoadMoreChunks && (
                <div
                  ref={sentinelRef}
                  className="h-1 w-full"
                  style={{ visibility: 'hidden' }}
                  aria-hidden="true"
                />
              )}

              {/* Chunk loading indicator */}
              {isLoadingMoreChunks && (
                <div className="flex justify-center py-6">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm">Loading more items...</span>
                  </div>
                </div>
              )}

              {/* Load More Chunks Button (backup for scroll detection) */}
              {!isLoadingMoreChunks && canLoadMoreChunks && (
                <div className="flex justify-center py-6">
                  <button
                    onClick={loadMoreChunks}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                    Load More Items (
                    {Math.min(
                      CHUNK_SIZE,
                      (canLoadMoreFileChunks ? allFiles.length - maxVisibleFiles : 0) +
                        (canLoadMoreFolderChunks ? allFolders.length - maxVisibleFolders : 0)
                    )}{' '}
                    more)
                  </button>
                </div>
              )}

              {/* Show More S3 Items Button (only when all cached chunks are displayed) */}
              {hasMoreItems && !canLoadMoreChunks && (
                <div className="flex justify-center mt-8 mb-8">
                  <button
                    onClick={loadMoreData}
                    disabled={isLoadingMore}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isLoadingMore ? (
                      <>
                        <div className="spinner"></div>
                        Loading more items...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                        Show More Items
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-8">
              <DashboardLoading showFolders={true} showFiles={true} fileLayout="grid" />
            </div>
          )}
        </div>
      </div>
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
