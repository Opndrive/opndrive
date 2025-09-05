'use client';

import { useScroll } from '@/context/scroll-context';
import { SuggestedFolders } from '@/features/dashboard/components/views/home/suggested-folders';
import { SuggestedFiles } from '@/features/dashboard/components/views/home/suggested-files';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { FileItem } from '@/features/dashboard/types/file';
import { useDriveStore } from '@/context/data-context';
import { apiS3 } from '@/services/byo-s3-api';
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
  const { isFiltersHidden } = useScroll();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentPrefix, cache, status, fetchData, setCurrentPrefix, setRootPrefix } =
    useDriveStore();

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
    console.log('Folder clicked:', folder);
  };

  const handleFolderMenuClick = (folder: Folder, _event: React.MouseEvent) => {
    console.log('Folder menu clicked:', folder);
  };

  const handleFileClick = (file: FileItem) => {
    console.log('File clicked:', file);
  };

  const handleFileAction = (action: string, file: FileItem) => {
    console.log('File action:', action, file);
  };

  const isReady = currentPrefix ? status[currentPrefix] === 'ready' : false;

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
            isFiltersHidden
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-normal text-foreground">{currentFolderName}</h2>
          </div>
        </div>

        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady ? (
            <>
              {/* Folders */}
              <SuggestedFolders
                folders={cache[currentPrefix]?.folders || []}
                onFolderClick={handleFolderClick}
                onFolderMenuClick={handleFolderMenuClick}
                className="mt-8"
                hideTitle={pathSegments.length > 0}
              />

              {/* Files */}
              <SuggestedFiles
                files={cache[currentPrefix]?.files || []}
                onFileClick={handleFileClick}
                onFileAction={handleFileAction}
                className="mt-8"
                hideTitle={pathSegments.length > 0}
              />
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
