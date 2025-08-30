'use client';

import { useScroll } from '@/context/scroll-context';
import { ViewDetails } from '@/components/ui/dashboard/details-sidebar/view-details';
import { SuggestedFolders } from '@/components/dashboard/home/suggested-folders';
import { SuggestedFiles } from '@/components/dashboard/home/suggested-files';
import { DashboardLoading } from '@/components/ui/dashboard/dashboard-skeleton';
import { Folder } from '@/types/dashboard/folder';
import { FileItem } from '@/types/dashboard/file';
import { useDriveStore } from '@/context/data-context';
import { apiS3 } from '@/lib/byo-s3-api';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FolderBreadcrumb } from '@/components/dashboard/layout/folder-breadcrumb';

export default function FolderPage() {
  const { isFiltersHidden } = useScroll();
  const params = useParams();
  const router = useRouter();
  const { currentPrefix, cache, status, fetchData, setCurrentPrefix, setRootPrefix } =
    useDriveStore();

  // Get the current folder path from URL params
  const pathSegments = Array.isArray(params.path) ? params.path : [];
  const currentPath = pathSegments.length > 0 ? pathSegments.join('/') + '/' : '';

  useEffect(() => {
    const rootPrefix = apiS3.getPrefix();
    if (rootPrefix === '') {
      setRootPrefix('/');
    } else {
      setRootPrefix(rootPrefix);
    }

    // Set current prefix based on URL path
    const fullPrefix = rootPrefix === '' ? currentPath : rootPrefix + currentPath;
    setCurrentPrefix(fullPrefix || (rootPrefix === '' ? '/' : rootPrefix));
  }, []);

  useEffect(() => {
    if (currentPrefix) {
      fetchData({ sync: false });
    }
  }, [currentPrefix]);

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix) {
      // Extract the folder name from the prefix
      const folderName = folder.name;
      if (folderName) {
        // Navigate to the new folder path using Google Drive pattern
        const newPath = pathSegments.length > 0 ? [...pathSegments, folderName] : [folderName];
        router.push(`/dashboard/folder/${newPath.join('/')}/`);
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

  return (
    <>
      {pathSegments.length > 0 && <FolderBreadcrumb pathSegments={pathSegments} />}

      <div className="relative">
        <div
          className={`sticky top-[-30px] z-10 flex items-center justify-between gap-4 py-4 bg-background transition-all duration-300 ${
            isFiltersHidden
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <h2 className="text-2xl font-normal text-foreground">
            {pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'My Drive'}
          </h2>
          <ViewDetails />
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
