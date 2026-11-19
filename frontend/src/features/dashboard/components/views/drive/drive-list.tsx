'use client';

import { useCurrentLayout } from '@/hooks/use-current-layout';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import type { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import type { PageState } from '@/context/folder-listing';
import { SuggestedFiles } from '../home/suggested-files';
import { VirtualDriveList } from './virtual-drive-list';
import { VirtualDriveGrid } from './virtual-drive-grid';

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
 *   shapes, and interleaving them leaves a ragged grid for no gain. The index
 *   space is still shared, so a range can cross from folders into files here
 *   too.
 *
 * Both draw only what is near the screen, and read the next page as the user
 * scrolls towards it.
 *
 * Home does not use this. It lists recent activity rather than a directory, so
 * it keeps the sectioned components directly.
 */

const IDLE: PageState = { status: 'idle' };

interface DriveListProps {
  folders: Folder[];
  files: FileItem[];
  /** Every page has been read. Without it the counts and the end of the list hedge. */
  complete?: boolean;
  /** The page after the loaded ones: being read, failed, or neither. */
  nextPage?: PageState;
  /** Reads the next page. */
  onLoadMore?: () => void;
  /** The folder shown, so its scroll position is kept per folder. */
  listingKey?: string;
  initialScrollOffset?: number;
  /** The folder's name, for the table's accessible label. */
  label?: string;
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
  complete = true,
  nextPage = IDLE,
  onLoadMore,
  listingKey,
  initialScrollOffset,
  label,
  onFolderClick,
  onFolderMenuClick,
  onFileClick,
  onFileAction,
  onFilesDropped,
  onFilesDroppedToFolder,
}: DriveListProps) {
  const { layout } = useCurrentLayout();

  // The empty-state drop zone, with the layout control. Only once every page
  // is in: until then an empty first page just means "keep reading".
  if (complete && folders.length === 0 && files.length === 0) {
    return (
      <SuggestedFiles
        files={files}
        onFileClick={onFileClick}
        onFileAction={onFileAction}
        onFilesDropped={onFilesDropped}
        className="mt-8"
        hideTitle
      />
    );
  }

  // A fresh list or grid per folder: its scroll position, focus and anchoring
  // belong to the folder, and none of it carries over to the next.
  if (layout !== 'list') {
    return (
      <VirtualDriveGrid
        key={listingKey}
        folders={folders}
        files={files}
        complete={complete}
        nextPage={nextPage}
        onLoadMore={onLoadMore}
        listingKey={listingKey}
        initialScrollOffset={initialScrollOffset}
        label={label}
        onFolderClick={onFolderClick}
        onFolderMenuClick={onFolderMenuClick}
        onFileAction={onFileAction}
        onFilesDropped={onFilesDropped}
        onFilesDroppedToFolder={onFilesDroppedToFolder}
      />
    );
  }

  return (
    <VirtualDriveList
      key={listingKey}
      folders={folders}
      files={files}
      complete={complete}
      nextPage={nextPage}
      onLoadMore={onLoadMore}
      listingKey={listingKey}
      initialScrollOffset={initialScrollOffset}
      label={label}
      onFolderClick={onFolderClick}
      onFolderMenuClick={onFolderMenuClick}
      onFileClick={onFileClick}
      onFileAction={onFileAction}
      onFilesDropped={onFilesDropped}
      onFilesDroppedToFolder={onFilesDroppedToFolder}
    />
  );
}
