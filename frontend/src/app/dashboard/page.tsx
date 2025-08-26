'use client';

import { DriveHero } from '@/components/dashboard/home/drive-hero';
import { useScroll } from '@/context/scroll-context';
import { ViewDetails } from '@/components/ui/dashboard/details-sidebar/view-details';
import { SuggestedFolders } from '@/components/dashboard/home/suggested-folders';
import { createFolder } from '@/lib/folder-helpers';
import { Folder } from '@/types/dashboard/folder';


// Mock data - replace with your actual data fetching logic
const mockSuggestedFolders: Folder[] = [
  createFolder("1", "Doc", "my-drive"),
  createFolder("2", "Backups", "my-drive"),
  createFolder("3", "Sewa", "my-drive"),
  createFolder("4", "Spiritual Proofs", "shared-with-me"),
  createFolder("5", "Projects", "my-drive"),
  createFolder("6", "Photos", "my-drive"),
]

export default function HomePage() {
  const { isFiltersHidden } = useScroll();

const handleFolderClick = (folder: Folder) => {
    console.log("Folder clicked:", folder)
    // Navigate to folder or perform action
  }

  const handleFolderMenuClick = (folder: Folder, event: React.MouseEvent) => {
    console.log("Folder menu clicked:", folder)
    // Show context menu or dropdown
  }
  

  return (
    <>
      <DriveHero />
      <div className="relative">
        <div
          className={`sticky top-[-28px] z-20 flex items-center justify-between gap-4  bg-background transition-all duration-300 ${isFiltersHidden ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
        >
          <h2 className="text-2xl font-normal text-foreground">Welcome to Opndrive</h2>
          <ViewDetails />
        </div>

       {/* Suggested Folders Section */}
        <SuggestedFolders
          folders={mockSuggestedFolders}
          onFolderClick={handleFolderClick}
          onFolderMenuClick={handleFolderMenuClick}
          className="mt-8"
        />
      </div>
    </>
  );
}
