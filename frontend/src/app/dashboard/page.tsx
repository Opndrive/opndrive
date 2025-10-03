'use client';

import { DriveHero } from '@/features/dashboard/components/views/home/drive-hero';
import { useScroll } from '@/context/scroll-context';
import { SuggestedFolders } from '@/features/dashboard/components/views/home/suggested-folders';
import { SuggestedFiles } from '@/features/dashboard/components/views/home/suggested-files';
import { DashboardLoading } from '@/features/dashboard/components/ui/skeletons/dashboard-skeleton';
import { Folder } from '@/features/dashboard/types/folder';
import { FileItem } from '@/features/dashboard/types/file';
import { useDriveStore } from '@/context/data-context';
import { useApiS3 } from '@/hooks/use-auth';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { useNotification } from '@/context/notification-context';
import { useUploadHandler } from '@/features/upload/hooks/use-upload-handler';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { AriaLabel } from '@/shared/components/custom-aria-label';

export default function HomePage() {
  const { isSearchHidden } = useScroll();
  const router = useRouter();
  const {
    currentPrefix,
    recentCache,
    recentStatus,
    fetchRecentItems,
    loadMoreRecentFiles,
    loadMoreRecentFolders,
    setCurrentPrefix,
    setRootPrefix,
    setApiS3,
  } = useDriveStore();

  const [isLoadingMoreFiles, setIsLoadingMoreFiles] = useState(false);
  const [isLoadingMoreFolders, setIsLoadingMoreFolders] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const apiS3 = useApiS3();

  if (!apiS3) {
    return 'Loading...';
  }

  useEffect(() => {
    if (apiS3) {
      setApiS3(apiS3);
    }
  }, [apiS3, setApiS3]);

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
    if (currentPrefix) fetchRecentItems({ sync: false, itemsPerType: 10 });
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
  };

  const handleFolderMenuClick = (_folder: Folder, _event: React.MouseEvent) => {};

  const handleFileClick = (_file: FileItem) => {};

  const handleFileAction = (_action: string, _file: FileItem) => {};

  // Drag and drop handlers
  const { showNotification } = useNotification();
  const { settings, isLoaded } = useSettings();

  const { handleFileUpload, handleFolderUpload } = useUploadHandler(
    {
      currentPath: currentPrefix || '',
      uploadMethod: isLoaded ? settings.general.uploadMethod : 'auto',
    },
    apiS3
  );

  const handleFilesDroppedToDirectory = useCallback(
    async (files: File[], folders: File[]) => {
      if (!apiS3 || !isLoaded || !handleFileUpload || !handleFolderUpload) {
        showNotification('error', 'Upload system not ready');
        return;
      }

      try {
        if (files.length > 0) {
          await handleFileUpload(files);
          showNotification(
            'success',
            `Started upload of ${files.length} file${files.length !== 1 ? 's' : ''}`
          );
        }

        if (folders.length > 0) {
          await handleFolderUpload(folders);
          showNotification(
            'success',
            `Started upload of folder contents (${folders.length} files)`
          );
        }
      } catch (error) {
        console.error('Drag and drop upload error:', error);
        showNotification('error', 'Failed to start upload');
      }
    },
    [apiS3, isLoaded, handleFileUpload, handleFolderUpload, showNotification]
  );

  const handleFilesDroppedToFolder = useCallback(
    async (files: File[], folders: File[], targetFolder: DragDropTarget) => {
      if (!apiS3 || !isLoaded || !handleFileUpload || !handleFolderUpload) {
        showNotification('error', 'Upload system not ready');
        return;
      }

      try {
        // Calculate the proper target path: currentPrefix + targetFolder.name + '/'
        let targetPath;
        if (currentPrefix && currentPrefix !== '/') {
          // If we have a current prefix, append the folder name to it
          targetPath = currentPrefix.endsWith('/')
            ? `${currentPrefix}${targetFolder.name}/`
            : `${currentPrefix}/${targetFolder.name}/`;
        } else {
          // If we're at root, just use the folder name
          targetPath = `${targetFolder.name}/`;
        }

        if (files.length > 0) {
          // Use the upload handler with the target path override
          await handleFileUpload(files, targetPath);
        }

        if (folders.length > 0) {
          await handleFolderUpload(folders, targetPath);
        }
      } catch (error) {
        console.error('Folder drop upload error:', error);
        showNotification('error', `Failed to upload to folder "${targetFolder.name}"`);
      }
    },
    [apiS3, isLoaded, handleFileUpload, handleFolderUpload, showNotification, currentPrefix]
  );

  const handleLoadMoreFiles = async () => {
    setIsLoadingMoreFiles(true);
    try {
      await loadMoreRecentFiles();
    } finally {
      setIsLoadingMoreFiles(false);
    }
  };

  const handleLoadMoreFolders = async () => {
    setIsLoadingMoreFolders(true);
    try {
      await loadMoreRecentFolders();
    } finally {
      setIsLoadingMoreFolders(false);
    }
  };

  const handleSync = async () => {
    if (isSyncing || !currentPrefix) return;

    setIsSyncing(true);
    try {
      await fetchRecentItems({ sync: true, itemsPerType: 10 });
    } catch (error) {
      console.error('Failed to sync data:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const isReady = currentPrefix ? recentStatus[currentPrefix] === 'ready' : false;
  const recentData = currentPrefix ? recentCache[currentPrefix] : null;

  return (
    <>
      <DriveHero />
      <div className="relative">
        <div
          className={`sticky top-[-20px] md:top-[-24px] z-10 flex items-center justify-between gap-4 py-4 bg-background transition-all duration-300 ${
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

        <div className="relative z-0">
          {/* Show loading state or actual content */}
          {currentPrefix && isReady && recentData ? (
            <>
              {/* Folders Section */}
              {recentData.folders && recentData.folders.length > 0 && (
                <SuggestedFolders
                  folders={recentData.folders}
                  onFolderClick={handleFolderClick}
                  onFolderMenuClick={handleFolderMenuClick}
                  onFilesDroppedToFolder={handleFilesDroppedToFolder}
                  onViewMore={handleLoadMoreFolders}
                  hasMore={recentData.hasMoreFolders}
                  isLoadingMore={isLoadingMoreFolders}
                  className="mt-8"
                />
              )}

              {/* Files Section */}
              {recentData.files && recentData.files.length > 0 && (
                <SuggestedFiles
                  files={recentData.files}
                  onFileClick={handleFileClick}
                  onFileAction={handleFileAction}
                  onFilesDropped={handleFilesDroppedToDirectory}
                  onViewMore={handleLoadMoreFiles}
                  hasMore={recentData.hasMoreFiles}
                  isLoadingMore={isLoadingMoreFiles}
                  className="mt-8"
                />
              )}

              {/* Empty state when no folders or files */}
              {(!recentData.folders || recentData.folders.length === 0) &&
                (!recentData.files || recentData.files.length === 0) && (
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
