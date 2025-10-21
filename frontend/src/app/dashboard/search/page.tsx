'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Fragment, useMemo } from 'react';
import { Search, ArrowLeft, X, FolderOpen, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSearch } from '@/features/dashboard/hooks/use-search';
import { SearchInput } from '@/features/dashboard/components/views/search/search-input';
import { Button } from '@/shared/components/ui/button';
import { FileItemList, FileItemGrid, FileItemMobile } from '@/features/dashboard/components/ui';
import { FolderItem } from '@/features/dashboard/components/ui';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { FolderSkeletonList } from '@/features/dashboard/components/ui/skeletons/folder-skeleton';
import { useCurrentLayout } from '@/hooks/use-current-layout';
import { useChunkedItems, formatItemCount } from '@/hooks/use-chunked-items';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import {
  CreditWarningDialog,
  shouldShowCreditWarning,
} from '@/shared/components/ui/credit-warning-dialog';
import { useDriveStore } from '@/context/data-context';
import { SearchBreadcrumb } from '@/features/dashboard/components/views/search/search-breadcrumb';
import { useMultiSelectStore } from '@/features/dashboard/stores/use-multi-select-store';
import { MultiSelectToolbar } from '@/features/dashboard/components/ui/multi-select-toolbar';
import { useMultiShareDialog } from '@/features/dashboard/hooks/use-multi-share-dialog';
import { MultiShareDialog } from '@/features/dashboard/components/dialogs/multi-share-dialog';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { ClickTooltip } from '@/shared/components/click-tooltip';
import { useCallback } from 'react';
import type { FileItem, FileExtension, FileMenuAction } from '@/features/dashboard/types/file';
import type { Folder, FolderMenuAction } from '@/features/dashboard/types/folder';
import type { _Object } from '@aws-sdk/client-s3';

// Import formatBytes function from data-context
function formatBytes(bytes: number | undefined): { value: number; unit: string } {
  if (!bytes || bytes < 0) return { value: 0, unit: 'B' };

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return {
    value: parseFloat(size.toFixed(2)),
    unit: units[i],
  };
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';
  const { layout: viewMode } = useCurrentLayout();
  const { currentPrefix } = useDriveStore();
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const {
    search,
    searchResults,
    isLoading,
    canLoadMore,
    invalidateCurrentQuery,
    cancelSearch,
    requestCount,
  } = useSearch();

  const { clearSelection, getSelectionCount } = useMultiSelectStore();
  const { isOpen, currentFiles, openMultiShareDialog, closeMultiShareDialog, generateShareLinks } =
    useMultiShareDialog();

  const handleCreditWarningConfirm = () => {
    if (pendingSearchQuery) {
      search(pendingSearchQuery);
      setPendingSearchQuery('');
    }
    setShowCreditWarning(false);
  };

  const handleCreditWarningClose = () => {
    setShowCreditWarning(false);
    setPendingSearchQuery('');
  };

  // Handler for refreshing search results
  const refreshSearchResults = useCallback(async () => {
    if (!query.trim()) return;
    try {
      await invalidateCurrentQuery();
      await search(query);
    } catch (error) {
      console.error('Failed to refresh search results:', error);
    }
  }, [query, invalidateCurrentQuery, search]);

  const handleSync = async () => {
    if (isSyncing || !query.trim()) return;

    setIsSyncing(true);
    try {
      await refreshSearchResults();
    } catch (error) {
      console.error('Failed to sync search results:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Search when query changes - now with automatic caching
  useEffect(() => {
    if (query.trim()) {
      if (shouldShowCreditWarning('search-operation')) {
        setPendingSearchQuery(query);
        setShowCreditWarning(true);
      } else {
        // search now checks cache automatically
        search(query);
      }
    }
  }, [query]); // Only depend on query, not search function

  // Clear selection when returning to search page
  useEffect(() => {
    clearSelection();
  }, []); // Empty dependency array - runs once on mount

  // Clear selection when query changes
  useEffect(() => {
    clearSelection();
  }, [query, clearSelection]);

  // Clear selection when multi-share dialog closes
  useEffect(() => {
    if (!isOpen) {
      clearSelection();
    }
  }, [isOpen, clearSelection]);

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

  // Handle ESC key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  // Convert search results to FileItem and Folder objects
  const folders: Folder[] =
    searchResults?.folders.map((folder: _Object, index: number) => {
      const folderPath = folder.Key?.slice(0, -1) || ''; // Remove trailing /
      const folderParts = folderPath.split('/');
      const folderName = folderParts[folderParts.length - 1] || folderPath;

      return {
        id: `folder-${index}`,
        name: folderName,
        Prefix: folder.Key,
        lastModified: folder.LastModified || new Date(),
        itemCount: 0,
      } as Folder;
    }) || [];

  const files: FileItem[] =
    searchResults?.files.map((file: _Object, index: number) => {
      const pathParts = file.Key?.split('/') || [];
      const fileName = pathParts[pathParts.length - 1] || file.Key || '';
      const extension = getFileExtensionWithoutDot(fileName);

      return {
        id: `file-${index}`,
        name: fileName,
        Key: file.Key,
        Size: file.Size, // Preserve original Size in bytes for preview checks
        extension: extension as FileExtension,
        lastModified: file.LastModified || new Date(),
        size: formatBytes(file.Size),
        ETag: file.ETag || '',
        StorageClass: file.StorageClass || 'STANDARD',
      } as FileItem;
    }) || [];

  // Use chunked display for performance with large result sets
  const {
    displayedItems: displayedFolders,
    canLoadMoreChunks: canLoadMoreFolderChunks,
    isLoadingChunks: isLoadingFolderChunks,
    sentinelRef: folderSentinelRef,
    loadMoreChunks: loadMoreFolderChunks,
    remainingItems: remainingFolders,
  } = useChunkedItems(folders, { chunkSize: 100 }, query);

  const {
    displayedItems: displayedFiles,
    canLoadMoreChunks: canLoadMoreFileChunks,
    isLoadingChunks: isLoadingFileChunks,
    sentinelRef: fileSentinelRef,
    loadMoreChunks: loadMoreFileChunks,
    remainingItems: remainingFiles,
  } = useChunkedItems(files, { chunkSize: 100 }, query);

  // Combined loading and chunking state
  const canLoadMoreChunks = canLoadMoreFolderChunks || canLoadMoreFileChunks;
  const totalDisplayed = displayedFolders.length + displayedFiles.length;

  const handleBackClick = () => {
    router.back();
  };

  const handleFileClick = (_file: FileItem) => {
    // Only used by FileItemMobile - component handles its own preview
    // This is just a passthrough, the actual opening is done internally
  };

  const handleFileAction = (_action: string, _file: FileItem) => {
    // Placeholder for file actions from mobile menu
  };

  const handleFolderClick = (folder: Folder) => {
    const folderUrl = generateFolderUrl({ prefix: folder.Prefix });
    router.push(folderUrl);
  };

  const loadMore = () => {
    if (canLoadMore && query.trim() && searchResults?.nextToken) {
      // API-level pagination: Fetch more results from backend
      search(query, searchResults.nextToken);
    }
  };

  // Helper function to get parent folder path from file Key
  const getParentFolderPath = useCallback((fileKey: string): string => {
    if (!fileKey) return '';
    const pathParts = fileKey.split('/').filter(Boolean);
    pathParts.pop(); // Remove filename or folder name
    return pathParts.join('/');
  }, []);

  // Create "Show in folder" action for files in search results
  const createShowInFolderAction = useCallback(
    (file: FileItem): FileMenuAction => ({
      id: 'show-in-folder',
      label: 'Show in folder',
      icon: FolderOpen,
      onClick: () => {
        const folderPath = getParentFolderPath(file.Key || '');
        if (folderPath) {
          const folderUrl = generateFolderUrl({ prefix: folderPath });
          router.push(folderUrl);
        }
      },
    }),
    [getParentFolderPath, router]
  );

  // Create "Show in folder" action for folders in search results
  const createFolderShowInParentAction = useCallback(
    (folder: Folder): FolderMenuAction => ({
      id: 'show-in-folder',
      label: 'Show in folder',
      icon: <FolderOpen size={16} className="flex-shrink-0" />,
      onClick: () => {
        const folderPath = getParentFolderPath(folder.Prefix || '');
        if (folderPath) {
          const folderUrl = generateFolderUrl({ prefix: folderPath });
          router.push(folderUrl);
        }
      },
    }),
    [getParentFolderPath, router]
  );

  // Create additional actions array for file items in search
  const searchFileActions = useMemo(
    () =>
      (file: FileItem): FileMenuAction[] => {
        return [createShowInFolderAction(file)];
      },
    [createShowInFolderAction]
  );

  // Create additional actions array for folder items in search
  const searchFolderActions = useMemo(
    () =>
      (folder: Folder): FolderMenuAction[] => {
        return [createFolderShowInParentAction(folder)];
      },
    [createFolderShowInParentAction]
  );

  if (!query) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackClick}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <SearchInput placeholder="Search files and folders..." autoFocus />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Search your files and folders
            </h2>
            <p className="text-muted-foreground">Enter a search term to find your content</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="pb-4 border-b border-border">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackClick}
              className="flex items-center hover:bg-card gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>

          <SearchInput initialQuery={query} placeholder="Search files and folders..." />

          {/* Breadcrumb Navigation - Show current location */}
          <div className="mt-3 pb-3 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium flex-shrink-0">
                Current Location:
              </span>
              <div className="min-w-0">
                <SearchBreadcrumb prefix={currentPrefix} />
              </div>
            </div>
          </div>

          {/* Search Info and Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              {isLoading && totalDisplayed === 0 ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Searching...
                </span>
              ) : totalDisplayed > 0 ? (
                <span className="flex items-center gap-2">
                  <span className="font-medium text-foreground hidden sm:inline">{query}</span>
                  <span className="text-muted-foreground hidden sm:inline">·</span>
                  <span className="text-xs sm:text-sm">
                    {formatItemCount(totalDisplayed, canLoadMore || canLoadMoreChunks)}
                  </span>
                  {/* Info icon with API request count tooltip */}
                  {(requestCount ?? 0) > 0 && (
                    <ClickTooltip
                      label={`${requestCount} API ${requestCount === 1 ? 'request' : 'requests'} made`}
                      position="top"
                      displayDuration={1500}
                    >
                      <div className="inline-flex items-center justify-center p-0.5 rounded hover:bg-secondary/50 transition-colors">
                        <Info className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-muted-foreground cursor-pointer transition-colors" />
                      </div>
                    </ClickTooltip>
                  )}
                </span>
              ) : (
                `No results for "${query}"`
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Cancel Button - only show when actively searching */}
              {isLoading && (
                <button
                  onClick={cancelSearch}
                  className="flex items-center justify-center px-3 py-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 hover:border-destructive/30 transition-all duration-200 group"
                  title="Cancel search"
                >
                  <X className="w-4 h-4 text-destructive group-hover:text-destructive" />
                  <span className="ml-2 text-sm font-medium text-destructive hidden sm:inline">
                    Cancel
                  </span>
                </button>
              )}

              {/* Sync Button */}
              <AriaLabel
                label={isSyncing ? 'Refreshing search results...' : 'Refresh search results'}
                position="bottom"
              >
                <button
                  onClick={handleSync}
                  disabled={isSyncing || !query.trim() || isLoading}
                  className="flex items-center justify-center p-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <HiOutlineRefresh
                    className={`w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground group-hover:text-foreground transition-all duration-200 ${
                      isSyncing ? 'animate-spin' : ''
                    }`}
                  />
                </button>
              </AriaLabel>

              {/* Layout Toggle */}
              <LayoutToggle />
            </div>
          </div>

          {/* Multi-select toolbar */}
          <div className="relative h-0 mt-2">
            <div className="absolute top-0 left-0 right-0 z-20 bg-background">
              <MultiSelectToolbar
                openMultiShareDialog={openMultiShareDialog}
                onDeleteSuccess={refreshSearchResults}
                showLocationActions={true}
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto pt-2 ">
          {isLoading && totalDisplayed === 0 ? (
            // Show skeleton loaders during initial load or cache miss
            <div className="mt-4">
              {/* Skeleton for folders */}
              <div className="mb-8">
                <div className="h-4 w-32 bg-muted/40 rounded mb-4 animate-pulse" />
                <FolderSkeletonList count={3} />
              </div>
            </div>
          ) : totalDisplayed === 0 ? (
            // Empty state - no results found
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No results found</h3>
                <p className="text-muted-foreground">Try adjusting your search terms or filters</p>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {/* Folders Section */}
              {displayedFolders.length > 0 && (
                <div className="mb-8 px-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">
                    Folders ({folders.length})
                  </h3>
                  <div
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-1'
                        : 'space-y-1'
                    }
                  >
                    {displayedFolders.map((folder: Folder, index: number) => (
                      <FolderItem
                        key={folder.Prefix}
                        folder={folder}
                        allFolders={displayedFolders}
                        index={index}
                        onClick={handleFolderClick}
                        additionalActions={searchFolderActions(folder)}
                        insertAdditionalActionsAfter="view"
                      />
                    ))}
                  </div>

                  {/* Sentinel for folder chunking */}
                  {canLoadMoreFolderChunks && (
                    <div ref={folderSentinelRef} className="h-4 w-full mt-2" aria-hidden="true" />
                  )}
                </div>
              )}

              {/* Files Section */}
              {files.length > 0 && (
                <div className="px-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">
                    Files ({files.length})
                  </h3>
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-1">
                      {displayedFiles.map((file: FileItem, index: number) => (
                        <FileItemGrid
                          key={file.Key}
                          file={file}
                          allFiles={displayedFiles}
                          index={index}
                          _onAction={() => {}}
                          additionalActions={searchFileActions(file)}
                          insertAdditionalActionsAfter="open"
                        />
                      ))}
                    </div>
                  ) : (
                    <div>
                      {/* Desktop List View */}
                      <div className="hidden sm:block space-y-1">
                        {/* Header with responsive grid matching file items */}
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                          {/* Name - always visible, responsive sizing */}
                          <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4">
                            Name
                          </div>

                          {/* Last Opened - visible from sm up */}
                          <div className="hidden sm:block sm:col-span-2 md:col-span-2 lg:col-span-3 xl:col-span-3">
                            Last Opened
                          </div>

                          {/* Owner - visible from lg up */}
                          <div className="hidden lg:block lg:col-span-2 xl:col-span-2">Owner</div>

                          {/* Size - visible from xl up */}
                          <div className="hidden xl:block xl:col-span-2">Size</div>

                          {/* Menu space - always visible */}
                          <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1"></div>
                        </div>

                        {displayedFiles.map((file: FileItem, index: number) => (
                          <Fragment key={file.Key}>
                            <FileItemList
                              file={file}
                              allFiles={displayedFiles}
                              index={index}
                              _onAction={() => {}}
                              additionalActions={searchFileActions(file)}
                              insertAdditionalActionsAfter="open"
                            />
                            {/* separator */}
                            {index < displayedFiles.length - 1 && (
                              <div className="mx-4" aria-hidden="true">
                                <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
                              </div>
                            )}
                          </Fragment>
                        ))}
                      </div>

                      {/* Mobile List View */}
                      <div className="sm:hidden">
                        <div className=" py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                          Files
                        </div>
                        <div className="divide-y divide-border/30">
                          {displayedFiles.map((file: FileItem, index: number) => (
                            <FileItemMobile
                              key={file.Key}
                              file={file}
                              allFiles={displayedFiles}
                              index={index}
                              onFileClick={handleFileClick}
                              _onAction={handleFileAction}
                              additionalActions={searchFileActions(file)}
                              insertAdditionalActionsAfter="open"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sentinel for file chunking - placed outside view mode conditionals */}
                  {canLoadMoreFileChunks && (
                    <div ref={fileSentinelRef} className="h-4 w-full mt-2" aria-hidden="true" />
                  )}
                </div>
              )}

              {/* Chunk Loading Indicator */}
              {(isLoadingFolderChunks || isLoadingFileChunks) && (
                <div className="mt-6 flex items-center justify-center gap-3 text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span className="text-sm">Loading more items...</span>
                </div>
              )}

              {/* Manual Load More Buttons */}
              {(canLoadMoreFolderChunks || canLoadMoreFileChunks) && (
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  {canLoadMoreFolderChunks && remainingFolders > 0 && (
                    <Button
                      onClick={loadMoreFolderChunks}
                      disabled={isLoadingFolderChunks}
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      {isLoadingFolderChunks
                        ? 'Loading...'
                        : `Load ${Math.min(remainingFolders, 100)} More Folder${remainingFolders > 1 ? 's' : ''}`}
                    </Button>
                  )}
                  {canLoadMoreFileChunks && remainingFiles > 0 && (
                    <Button
                      onClick={loadMoreFileChunks}
                      disabled={isLoadingFileChunks}
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      {isLoadingFileChunks
                        ? 'Loading...'
                        : `Load ${Math.min(remainingFiles, 100)} More File${remainingFiles > 1 ? 's' : ''}`}
                    </Button>
                  )}
                </div>
              )}

              {/* API Pagination Load More Button - Only show when all UI chunks are displayed */}
              {canLoadMore && !canLoadMoreChunks && (
                <div className="mt-8 text-center">
                  <Button
                    onClick={loadMore}
                    disabled={isLoading}
                    variant="outline"
                    className="min-w-[200px]"
                  >
                    {isLoading ? 'Loading...' : 'Load More Results (50)'}
                  </Button>
                </div>
              )}
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

      {/* Credit Warning Dialog */}
      <CreditWarningDialog
        isOpen={showCreditWarning}
        onClose={handleCreditWarningClose}
        onConfirm={handleCreditWarningConfirm}
        operationType="search-operation"
      />
    </>
  );
}
