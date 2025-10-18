'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Fragment } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSearch } from '@/features/dashboard/hooks/use-search';
import { SearchBar } from '@/features/dashboard/components/views/search/search-bar';
import { Button } from '@/shared/components/ui/button';
import { FileItemList, FileItemGrid, FileItemMobile } from '@/features/dashboard/components/ui';
import { FolderItem } from '@/features/dashboard/components/ui';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useCurrentLayout } from '@/hooks/use-current-layout';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';
import { useFilePreview } from '@/context/file-preview-context';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import {
  CreditWarningDialog,
  shouldShowCreditWarning,
} from '@/shared/components/ui/credit-warning-dialog';
import type { FileItem, FileExtension } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { _Object } from '@aws-sdk/client-s3';

// Type for processed search results
type ProcessedSearchResult = { type: 'file'; data: FileItem } | { type: 'folder'; data: Folder };

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
  const { openPreview } = useFilePreview();
  const { layout: viewMode } = useCurrentLayout();
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const { searchFiles, searchWithPagination, searchResults, isLoading, canLoadMore } = useSearch();

  const handleCreditWarningConfirm = () => {
    if (pendingSearchQuery) {
      searchFiles(pendingSearchQuery);
      setPendingSearchQuery('');
    }
    setShowCreditWarning(false);
  };

  const handleCreditWarningClose = () => {
    setShowCreditWarning(false);
    setPendingSearchQuery('');
  };

  const handleSync = async () => {
    if (isSyncing || !query.trim()) return;

    setIsSyncing(true);
    try {
      // Re-run the search with fresh data
      await searchFiles(query);
    } catch (error) {
      console.error('Failed to sync search results:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Search when query changes
  useEffect(() => {
    if (query.trim()) {
      if (shouldShowCreditWarning('search-operation')) {
        setPendingSearchQuery(query);
        setShowCreditWarning(true);
      } else {
        searchFiles(query);
      }
    }
  }, [query, searchFiles]);

  // Convert search results to FileItem and Folder objects
  const processedResults =
    searchResults?.matches.map((match: _Object, index: number) => {
      const isFolder = match.Key?.endsWith('/');
      const pathParts = match.Key?.split('/') || [];

      if (isFolder) {
        // Create folder object
        const folderPath = match.Key?.slice(0, -1) || '';
        const folderParts = folderPath.split('/');
        const folderName = folderParts[folderParts.length - 1] || folderPath;

        return {
          type: 'folder' as const,
          data: {
            id: `folder-${index}`,
            name: folderName,
            Prefix: match.Key,
            lastModified: match.LastModified || new Date(),
            itemCount: 0,
          } as Folder,
        };
      } else {
        // Create file object
        const fileName = pathParts[pathParts.length - 1] || match.Key || '';
        const extension = getFileExtensionWithoutDot(fileName);

        return {
          type: 'file' as const,
          data: {
            id: `file-${index}`,
            name: fileName,
            Key: match.Key,
            extension: extension as FileExtension,
            lastModified: match.LastModified || new Date(),
            size: formatBytes(match.Size),
            ETag: match.ETag || '',
            StorageClass: match.StorageClass || 'STANDARD',
          } as FileItem,
        };
      }
    }) || [];

  const files = processedResults
    .filter((item: ProcessedSearchResult) => item.type === 'file')
    .map((item: ProcessedSearchResult) => item.data as FileItem);
  const folders = processedResults
    .filter((item: ProcessedSearchResult) => item.type === 'folder')
    .map((item: ProcessedSearchResult) => item.data as Folder);

  const handleBackClick = () => {
    router.back();
  };

  const handleFileClick = (file: FileItem) => {
    const previewableFile = {
      id: file.id,
      name: file.name,
      key: file.Key,
      size: file.size?.value || 0,
      lastModified: file.lastModified,
      type: file.extension || getFileExtensionWithoutDot(file.name),
    };
    openPreview(previewableFile, [previewableFile]);
  };

  const handleFolderClick = (folder: Folder) => {
    const folderUrl = generateFolderUrl({ prefix: folder.Prefix });
    router.push(folderUrl);
  };

  const loadMore = () => {
    if (canLoadMore && query.trim()) {
      searchWithPagination(query, searchResults?.nextToken);
    }
  };

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
          <SearchBar placeholder="Search files and folders..." />
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

          <SearchBar placeholder="Search files and folders..." />

          {/* Search Info and Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Searching...
                </span>
              ) : (
                `${processedResults.length} results for "${query}"`
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Sync Button */}
              <button
                onClick={handleSync}
                disabled={isSyncing || !query.trim()}
                className="flex items-center justify-center p-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                title="Refresh search results"
              >
                <HiOutlineRefresh
                  className={`w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground group-hover:text-foreground transition-all duration-200 ${
                    isSyncing ? 'animate-spin' : ''
                  }`}
                />
              </button>

              {/* Layout Toggle */}
              <LayoutToggle />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {isLoading && processedResults.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent mx-auto mb-4" />
                <p className="text-muted-foreground">Searching...</p>
              </div>
            </div>
          ) : processedResults.length === 0 ? (
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
              {folders.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
                    Folders ({folders.length})
                  </h3>
                  <div
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
                        : 'space-y-1'
                    }
                  >
                    {folders.map((folder: Folder) => (
                      <FolderItem key={folder.Prefix} folder={folder} onClick={handleFolderClick} />
                    ))}
                  </div>
                </div>
              )}

              {/* Files Section */}
              {files.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">
                    Files ({files.length})
                  </h3>
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {files.map((file: FileItem) => (
                        <div
                          key={file.Key}
                          onClick={() => handleFileClick(file)}
                          className="cursor-pointer"
                        >
                          <FileItemGrid file={file} _onAction={() => {}} />
                        </div>
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

                        {files.map((file: FileItem, index: number) => (
                          <Fragment key={file.Key}>
                            <div onClick={() => handleFileClick(file)} className="cursor-pointer">
                              <FileItemList file={file} allFiles={files} _onAction={() => {}} />
                            </div>
                            {/* Professional separator */}
                            {index < files.length - 1 && (
                              <div className="mx-4" aria-hidden="true">
                                <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
                              </div>
                            )}
                          </Fragment>
                        ))}
                      </div>

                      {/* Mobile List View */}
                      <div className="sm:hidden">
                        <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                          Files
                        </div>
                        <div className="divide-y divide-border/30">
                          {files.map((file: FileItem, index: number) => (
                            <FileItemMobile
                              key={file.Key}
                              file={file}
                              allFiles={files}
                              index={index}
                              onFileClick={handleFileClick}
                              _onAction={() => {}}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Load More Button */}
              {canLoadMore && (
                <div className="mt-8 text-center">
                  <Button onClick={loadMore} disabled={isLoading} variant="outline">
                    {isLoading ? 'Loading...' : 'Load More Results'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
