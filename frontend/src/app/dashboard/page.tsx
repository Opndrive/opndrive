'use client';

import { DriveHero } from '@/components/dashboard/home/drive-hero';
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
import { useRouter } from 'next/navigation';
import { generateFolderUrl } from '@/lib/folder-navigation';

export default function HomePage() {
  const { isFiltersHidden } = useScroll();
  const router = useRouter();
  const { currentPrefix, cache, status, fetchData, setCurrentPrefix, setRootPrefix } =
    useDriveStore();

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
    if (currentPrefix) fetchData({ sync: false });
  }, [currentPrefix]);

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix && folder.name) {
      // Navigate to the folder using the enhanced browse route
      const url = generateFolderUrl({
        prefix: `${folder.name}/`,
        key: folder.name,
      });
      router.push(url);
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
      <DriveHero />
      <div className="relative">
        <div
          className={`sticky top-[-30px] z-10 flex items-center justify-between gap-4 py-4 bg-background transition-all duration-300 ${
            isFiltersHidden
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <h2 className="text-2xl font-normal text-foreground">Welcome to Opndrive</h2>
          <ViewDetails />
        </div>

        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady ? (
            <>
              {/* Folders Section */}
              {cache[currentPrefix]?.folders && cache[currentPrefix].folders.length > 0 && (
                <SuggestedFolders
                  folders={cache[currentPrefix]?.folders || []}
                  onFolderClick={handleFolderClick}
                  onFolderMenuClick={handleFolderMenuClick}
                  className="mt-8"
                />
              )}

              {/* Files Section */}
              {cache[currentPrefix]?.files && cache[currentPrefix].files.length > 0 && (
                <SuggestedFiles
                  files={cache[currentPrefix]?.files || []}
                  onFileClick={handleFileClick}
                  onFileAction={handleFileAction}
                  className="mt-8"
                />
              )}

              {/* Empty state when no folders or files */}
              {(!cache[currentPrefix]?.folders || cache[currentPrefix].folders.length === 0) &&
                (!cache[currentPrefix]?.files || cache[currentPrefix].files.length === 0) && (
                  <div className="text-center py-12 mt-8">
                    <p className="text-muted-foreground">No files or folders available.</p>
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
