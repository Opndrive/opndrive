'use client';

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
  }, [pathSegments, setRootPrefix, setCurrentPrefix]);

  useEffect(() => {
    if (currentPrefix) fetchData({ sync: false });
  }, [currentPrefix, fetchData]);

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
      {/* Show breadcrumb for folder navigation */}
      <FolderBreadcrumb pathSegments={pathSegments} />

      <div className="relative">
        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady ? (
            <>
              {/* Folders Section */}
              {cache[currentPrefix]?.folders && cache[currentPrefix].folders.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-medium text-foreground mb-4 px-1">Folders</h3>
                  <SuggestedFolders
                    folders={cache[currentPrefix]?.folders || []}
                    onFolderClick={handleFolderClick}
                    onFolderMenuClick={handleFolderMenuClick}
                    hideTitle={true}
                  />
                </div>
              )}

              {/* Files Section */}
              {cache[currentPrefix]?.files && cache[currentPrefix].files.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-medium text-foreground mb-4 px-1">Files</h3>
                  <SuggestedFiles
                    files={cache[currentPrefix]?.files || []}
                    onFileClick={handleFileClick}
                    onFileAction={handleFileAction}
                    hideTitle={true}
                  />
                </div>
              )}

              {/* Empty state when no folders or files */}
              {(!cache[currentPrefix]?.folders || cache[currentPrefix].folders.length === 0) &&
                (!cache[currentPrefix]?.files || cache[currentPrefix].files.length === 0) && (
                  <div className="text-center py-12 mt-8">
                    <p className="text-muted-foreground">No files or folders in this location.</p>
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
