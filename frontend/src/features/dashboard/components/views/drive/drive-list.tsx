'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurrentLayout } from '@/hooks/use-current-layout';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import type { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import type { PageState } from '@/context/folder-listing';
import { SuggestedFiles } from '../home/suggested-files';
import { SuggestedFolders } from '../home/suggested-folders';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { VirtualDriveList } from './virtual-drive-list';

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
 *   Folders lead, as they do everywhere that lists a directory. It draws only
 *   the rows near the screen, and reads the next page as the user scrolls.
 * - **Grid** keeps the two sections. Folder cards and file cards are different
 *   shapes, and interleaving them leaves a ragged grid for no gain.
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

  if (layout !== 'list') {
    return (
      <GridDrive
        folders={folders}
        files={files}
        complete={complete}
        nextPage={nextPage}
        onLoadMore={onLoadMore}
        onFolderClick={onFolderClick}
        onFolderMenuClick={onFolderMenuClick}
        onFileClick={onFileClick}
        onFileAction={onFileAction}
        onFilesDropped={onFilesDropped}
        onFilesDroppedToFolder={onFilesDroppedToFolder}
      />
    );
  }

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

  return (
    <VirtualDriveList
      // A fresh list per folder: its scroll position, focus and anchoring
      // belong to the folder, and none of it carries over to the next.
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

/** Cards revealed per step in grid view. */
const GRID_STEP = 100;

/**
 * Grid view, revealing cards a hundred at a time as the user nears the end.
 *
 * Not virtualized yet. It shows what is loaded in steps rather than all at
 * once, then reads the next page when everything loaded is on screen, with no
 * buttons and no timers.
 */
function GridDrive({
  folders,
  files,
  complete,
  nextPage,
  onLoadMore,
  onFolderClick,
  onFolderMenuClick,
  onFileClick,
  onFileAction,
  onFilesDropped,
  onFilesDroppedToFolder,
}: Omit<DriveListProps, 'complete' | 'nextPage'> & { complete: boolean; nextPage: PageState }) {
  const [shown, setShown] = useState(GRID_STEP);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const allShown = shown >= folders.length + files.length;
  const waiting = !allShown || (!complete && nextPage.status === 'idle');

  /**
   * One observer per state, so it reports straight away: a sentinel still on
   * screen after a step needs no scroll to ask for the next.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !waiting || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (!allShown) setShown((n) => n + GRID_STEP);
        else onLoadMore?.();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [allShown, waiting, shown, onLoadMore]);

  const shownFolders = folders.slice(0, shown);
  const shownFiles = files.slice(0, Math.max(0, shown - folders.length));

  /**
   * The toggle belongs to whichever section comes first.
   *
   * In grid the file heading sits below the entire folder grid, so leaving the
   * toggle there moved it a section's height away from the pointer that had
   * just clicked it. SuggestedFolders renders nothing when there are no
   * folders, so in that case the files keep it.
   */
  const foldersLead = shownFolders.length > 0;

  return (
    <>
      <SuggestedFolders
        folders={shownFolders}
        onFolderClick={onFolderClick}
        onFolderMenuClick={onFolderMenuClick}
        onFilesDroppedToFolder={onFilesDroppedToFolder}
        className="mt-8"
        title="Folders"
        headerAction={<LayoutToggle />}
      />
      {complete || shownFiles.length > 0 || !foldersLead ? (
        <SuggestedFiles
          files={shownFiles}
          onFileClick={onFileClick}
          onFileAction={onFileAction}
          onFilesDropped={onFilesDropped}
          className="mt-8"
          title="Files"
          hideLayoutToggle={foldersLead}
        />
      ) : null}

      {waiting ? <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" /> : null}

      {nextPage.status === 'loading' ? (
        <div className="flex justify-center py-6 text-sm text-muted-foreground">Loading more…</div>
      ) : null}
      {nextPage.status === 'error' ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <span>Couldn&apos;t load more</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onLoadMore?.()}
            className="cursor-pointer rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/10"
          >
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
