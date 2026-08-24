'use client';

import { useCurrentLayout } from '@/hooks/use-current-layout';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import type { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import { SuggestedFiles } from '../home/suggested-files';
import { SuggestedFolders } from '../home/suggested-folders';
import { FolderItemList } from '../../ui/items/folder-item-list';
import { FolderItemMobile } from '../../ui/items/folder-item-mobile';
import { FolderDropTarget } from '@/features/upload/components/folder-drop-target';

/**
 * The drive's contents, in whichever shape the current layout calls for.
 *
 * List and grid want genuinely different groupings, and pretending otherwise is
 * what produced the old arrangement: a block of folder cards with its own
 * heading sitting above a file table with its own heading, for what is really
 * one directory.
 *
 * - **List** is one table. Folders and files share a header and an index
 *   space, so a range can run from a folder into the files below it.
 *   Folders lead, as they do everywhere that lists a directory.
 * - **Grid** keeps the two sections. Folder cards and file cards are different
 *   shapes, and interleaving them leaves a ragged grid for no gain.
 *
 * Home does not use this. It lists recent activity rather than a directory, so
 * it keeps the sectioned components directly.
 */

interface DriveListProps {
  folders: Folder[];
  files: FileItem[];
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onFilesDropped?: (processedData: ProcessedDragData) => void;
  onFilesDroppedToFolder?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

export function DriveList({
  folders,
  files,
  onFolderClick,
  onFolderMenuClick,
  onFileClick,
  onFileAction,
  onFilesDropped,
  onFilesDroppedToFolder,
}: DriveListProps) {
  const { layout } = useCurrentLayout();

  if (layout !== 'list') {
    return (
      <>
        <SuggestedFolders
          folders={folders}
          onFolderClick={onFolderClick}
          onFolderMenuClick={onFolderMenuClick}
          onFilesDroppedToFolder={onFilesDroppedToFolder}
          className="mt-8"
          title="Folders"
        />
        <SuggestedFiles
          files={files}
          onFileClick={onFileClick}
          onFileAction={onFileAction}
          onFilesDropped={onFilesDropped}
          className="mt-8"
          title="Files"
        />
      </>
    );
  }

  /**
   * One index space across both kinds, folders first.
   *
   * Shift-select ranges are computed by slicing this array between two indices,
   * so the numbers a row reports have to describe its position in the table the
   * user can actually see. Indexing each kind from zero would make a range from
   * folder 1 to file 3 select the wrong four things.
   */
  const allItems = [...folders, ...files];

  return (
    <SuggestedFiles
      files={files}
      onFileClick={onFileClick}
      onFileAction={onFileAction}
      onFilesDropped={onFilesDropped}
      className="mt-8"
      // No section heading in the unified table: the page is already titled,
      // and "Files" above a list that opens with folders would be a lie.
      hideTitle
      allItems={allItems}
      fileIndexOffset={folders.length}
      leadingRows={folders.map((folder, index) => (
        <FolderDropTarget
          key={folder.Prefix ?? folder.name}
          folder={{
            id: folder.Prefix || folder.name,
            name: folder.name,
            path: folder.Prefix || folder.name,
          }}
          onFilesDropped={onFilesDroppedToFolder ?? (() => {})}
        >
          <FolderItemList
            folder={folder}
            index={index}
            allItems={allItems}
            onClick={onFolderClick}
            onMenuClick={onFolderMenuClick}
          />
        </FolderDropTarget>
      ))}
      // The list view renders a tree per breakpoint and shows one of them, so
      // the folder rows have to exist in both or they vanish below `sm`.
      leadingMobileRows={folders.map((folder, index) => (
        <FolderDropTarget
          key={folder.Prefix ?? folder.name}
          folder={{
            id: folder.Prefix || folder.name,
            name: folder.name,
            path: folder.Prefix || folder.name,
          }}
          onFilesDropped={onFilesDroppedToFolder ?? (() => {})}
        >
          <FolderItemMobile
            folder={folder}
            index={index}
            allFolders={allItems}
            onFolderClick={onFolderClick}
          />
        </FolderDropTarget>
      ))}
    />
  );
}
