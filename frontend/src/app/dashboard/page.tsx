'use client';

import { DriveHero } from '@/components/dashboard/home/drive-hero';
import { useScroll } from '@/context/scroll-context';
import { ViewDetails } from '@/components/ui/dashboard/details-sidebar/view-details';
import { SuggestedFolders } from '@/components/dashboard/home/suggested-folders';
import { SuggestedFiles } from '@/components/dashboard/home/suggested-files';
import { createFolder } from '@/lib/folder-helpers';
import { mockSuggestedFiles } from '@/lib/file-helpers';
import { Folder } from '@/types/dashboard/folder';
import { FileItem } from '@/types/dashboard/file';

const mockSuggestedFolders: Folder[] = [
  createFolder('1', 'Doc', 'my-drive'),
  createFolder('2', 'Backups', 'my-drive'),
  createFolder('3', 'Sewa', 'my-drive'),
  createFolder('4', 'Spiritual Proofs', 'shared-with-me'),
  createFolder('5', 'Projects', 'my-drive'),
  createFolder('6', 'Photos', 'my-drive'),
];

export default function HomePage() {
  const { isFiltersHidden } = useScroll();

  const handleFolderClick = (folder: Folder) => {
    console.log('Folder clicked:', folder);
    // Navigate to folder or perform action
  };

  const handleFolderMenuClick = (folder: Folder, _event: React.MouseEvent) => {
    console.log('Folder menu clicked:', folder);
    // Show context menu or dropdown
  };

  const handleFileClick = (file: FileItem) => {
    console.log('File clicked:', file);
    // Open file or perform action
  };

  const handleFileAction = (action: string, file: FileItem) => {
    console.log('File action:', action, file);
    // Handle file action
  };

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
          {/* Suggested Folders Section */}
          <SuggestedFolders
            folders={mockSuggestedFolders}
            onFolderClick={handleFolderClick}
            onFolderMenuClick={handleFolderMenuClick}
            className="mt-8"
          />

          {/* Suggested Files Section */}
          <SuggestedFiles
            files={mockSuggestedFiles}
            onFileClick={handleFileClick}
            onFileAction={handleFileAction}
            className="mt-8"
          />
        </div>
      </div>
    </>
  );
}
