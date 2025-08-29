'use client';

import { DriveHero } from '@/components/dashboard/home/drive-hero';
import { useScroll } from '@/context/scroll-context';
import { ViewDetails } from '@/components/ui/dashboard/details-sidebar/view-details';
import { SuggestedFolders } from '@/components/dashboard/home/suggested-folders';
import { SuggestedFiles } from '@/components/dashboard/home/suggested-files';
import { Folder } from '@/types/dashboard/folder';
import { FileItem } from '@/types/dashboard/file';
import { useDriveStore } from '@/context/data-context';
import { apiS3 } from '@/lib/byo-s3-api';
import { useEffect } from 'react';

export default function HomePage() {
  const { isFiltersHidden } = useScroll();
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

    fetchData({ sync: true });
  }, []);

  useEffect(() => {
    if (currentPrefix) fetchData({ sync: true });
  }, [currentPrefix]);

  const handleFolderClick = (folder: Folder) => {
    if (folder.Prefix) {
      setCurrentPrefix(folder.Prefix);
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
          {/* Only render SuggestedFolders when data is loaded */}
          {currentPrefix && isReady ? (
            <SuggestedFolders
              folders={cache[currentPrefix]?.folders || []}
              onFolderClick={handleFolderClick}
              onFolderMenuClick={handleFolderMenuClick}
              className="mt-8"
            />
          ) : (
            <div className="mt-8 text-muted-foreground text-sm">Loading folders...</div>
          )}

          {/* SuggestedFiles can stay static or use same logic if needed */}
          {currentPrefix && isReady ? (
            <SuggestedFiles
              files={cache[currentPrefix]?.files || []}
              onFileClick={handleFileClick}
              onFileAction={handleFileAction}
              className="mt-8"
            />
          ) : (
            <div className="mt-8 text-muted-foreground text-sm">Loading files...</div>
          )}
        </div>
      </div>
    </>
  );
}
