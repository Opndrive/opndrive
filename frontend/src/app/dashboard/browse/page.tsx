'use client';

import { useScroll } from '@/context/scroll-context';
import { SuggestedFolders } from '@/features/dashboard/components/views/home/suggested-folders';
import { SuggestedFiles } from '@/features/dashboard/components/views/home/suggested-files';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { FileItem } from '@/features/dashboard/types/file';
import { useDriveStore } from '@/context/data-context';
import { useApiS3 } from '@/hooks/use-auth';
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EnhancedFolderBreadcrumb } from '@/features/dashboard/components/layout/breadcrumb/enhanced-folder-breadcrumb';
import {
  parseFolderParams,
  prefixToPathSegments,
  buildFolderClickUrl,
  getFolderNameFromPrefix,
} from '@/features/folder-navigation/folder-navigation';

function BrowsePageContent() {
  const { isSearchHidden } = useScroll();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentPrefix,
    cache,
    status,
    loadMoreStatus,
    fetchData,
    loadMoreData,
    setCurrentPrefix,
    setRootPrefix,
  } = useDriveStore();

  const apiS3 = useApiS3();

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

  useEffect(() => {
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
  }, [prefixParam, setCurrentPrefix, setRootPrefix]);

  useEffect(() => {
    if (currentPrefix) {
      fetchData({ sync: false });
    }
  }, [currentPrefix, fetchData]);

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

  const isReady = currentPrefix ? status[currentPrefix] === 'ready' : false;
  const isLoadingMore = currentPrefix ? loadMoreStatus[currentPrefix] === 'loading' : false;
  const currentData = currentPrefix ? cache[currentPrefix] : null;

  // Calculate item counts
  const visibleFolders = currentData?.folders || [];
  const visibleFiles = currentData?.files || [];
  const totalVisibleItems = visibleFolders.length + visibleFiles.length;
  const hasMoreItems = currentData?.isTruncated || false;

  // Get current folder name for display using utility function
  const currentFolderName = getFolderNameFromPrefix(prefixParam);

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
        <div
          className={`sticky top-[-30px] z-10 flex items-center justify-between gap-4 py-4 bg-background transition-all duration-300 ${
            isSearchHidden
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-normal text-foreground">{currentFolderName}</h2>
            {isReady && totalVisibleItems > 0 && (
              <span className="item-count-badge">
                {hasMoreItems
                  ? `Showing ${totalVisibleItems.toLocaleString()}+ items`
                  : `${totalVisibleItems.toLocaleString()} item${totalVisibleItems === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
        </div>

        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady ? (
            <>
              {/* Folders */}
              <SuggestedFolders
                folders={visibleFolders}
                onFolderClick={handleFolderClick}
                onFolderMenuClick={handleFolderMenuClick}
                className="mt-8"
                hideTitle={pathSegments.length > 0}
              />

              {/* Files */}
              <SuggestedFiles
                files={visibleFiles}
                onFileClick={handleFileClick}
                onFileAction={handleFileAction}
                className="mt-8"
                hideTitle={pathSegments.length > 0}
              />

              {/* Show More Button */}
              {hasMoreItems && (
                <div className="flex justify-center mt-8 mb-8">
                  <button onClick={loadMoreData} disabled={isLoadingMore} className="show-more-btn">
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
