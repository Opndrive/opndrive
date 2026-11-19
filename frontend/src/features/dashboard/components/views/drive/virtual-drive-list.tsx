'use client';

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import type { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import type { PageState } from '@/context/folder-listing';
import { DESKTOP_LIST_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { FolderDropTarget } from '@/features/upload/components/folder-drop-target';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useListingDrop } from '@/features/dashboard/hooks/use-listing-drop';
import { FileItemList } from '../../ui/items/file-item-list';
import { FileItemMobile } from '../../ui/items/file-item-mobile';
import { FolderItemList } from '../../ui/items/folder-item-list';
import { FolderItemMobile } from '../../ui/items/folder-item-mobile';
import { listRows, rowHeight, type ListRow } from './list-rows';
import {
  FoldersNote,
  MoreRow,
  scrollInstantly,
  scrollParentOf,
  useLoadedAnnouncement,
  usePrefetchNextPage,
  useRememberScroll,
  useMeasureScrollMargin,
  useSelectionKeys,
} from './virtual-shared';

/**
 * One folder in list view, drawing only the rows near the screen.
 *
 * However many entries are loaded, the DOM holds what fits in the scroll
 * container plus a few screens' worth either side. Rows are fixed-height divs,
 * so nothing is measured while scrolling, and they are placed absolutely inside
 * a spacer as tall as the whole list. The scroll container stays the
 * dashboard's own `<main>`, so the page header scrolls away exactly as before.
 *
 * Pages are read as the user scrolls: within two screens of the loaded end,
 * the next one is asked for, so in practice it is there before they arrive. A
 * page that fails becomes a retry row and leaves every row above it alone.
 *
 * Folders sit above files. A folder found on a later page joins them, which
 * inserts a row above wherever the user is reading; the virtualizer keeps the
 * row at the top of the screen where it was, so nothing visibly moves.
 */

/**
 * Rows drawn beyond each edge of the screen: enough that wheel scrolling never
 * shows a gap, few enough that a jump across the list mounts one screenful.
 */
const OVERSCAN = 6;

interface VirtualDriveListProps {
  folders: Folder[];
  files: FileItem[];
  /** Every page has been read. */
  complete: boolean;
  /** The page after the loaded ones. */
  nextPage: PageState;
  /** Reads the next page. Safe to call while one is on the way. */
  onLoadMore?: () => void;
  /**
   * Whose scroll position this list holds. Where it was when the user last
   * left is restored when they come back.
   */
  listingKey?: string;
  initialScrollOffset?: number;
  /** What the table is called for a screen reader. */
  label?: string;
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onFilesDropped?: (processedData: ProcessedDragData) => void;
  onFilesDroppedToFolder?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

export function VirtualDriveList({
  folders,
  files,
  complete,
  nextPage,
  onLoadMore,
  listingKey,
  initialScrollOffset = 0,
  label = 'Folders and files',
  onFolderClick,
  onFolderMenuClick,
  onFileClick,
  onFileAction,
  onFilesDropped,
  onFilesDroppedToFolder,
}: VirtualDriveListProps) {
  const desktop = useMediaQuery(DESKTOP_LIST_QUERY, true);
  const { isDropTarget, onDragOver, onDrop } = useListingDrop(onFilesDropped);

  const rows = useMemo(() => listRows(folders, files, complete), [folders, files, complete]);
  // What shift-select slices: folders then files, the order they are drawn in.
  const allItems = useMemo<(Folder | FileItem)[]>(() => [...folders, ...files], [folders, files]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => scrollParentOf(bodyRef), []);

  /**
   * The row with focus is always drawn, wherever the list has scrolled to.
   *
   * Without this, scrolling away with the wheel unmounted the focused row,
   * dropping focus to the page and taking an open menu's anchor with it.
   */
  const focused = useRef<{ key: string; index: number } | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range);
    const held = focused.current;
    if (!held || indexes.length === 0) return indexes;

    let index = held.index;
    if (rowsRef.current[index]?.key !== held.key) {
      index = rowsRef.current.findIndex((row) => row.key === held.key);
      if (index < 0) {
        focused.current = null;
        return indexes;
      }
      held.index = index;
    }

    if (index < indexes[0]!) return [index, ...indexes];
    if (index > indexes[indexes.length - 1]!) return [...indexes, index];
    return indexes;
  }, []);

  const estimateSize = useCallback((i: number) => rowHeight(rows[i]!, desktop), [rows, desktop]);
  const getItemKey = useCallback((i: number) => rows[i]!.key, [rows]);

  const initialOffset = useRef(initialScrollOffset).current;
  /** Where the rows start within `<main>`'s scrolling content. */
  const margin = useState(0);
  const scrollMargin = margin[0];

  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count: rows.length,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN,
    scrollMargin,
    rangeExtractor,
    scrollToFn: scrollInstantly,
    // Mounting scrolls `<main>` here: where the user left this folder, or the top.
    initialOffset,
    // Rows before the first measure, so the first frame is not blank.
    initialRect: { width: 0, height: typeof window === 'undefined' ? 800 : window.innerHeight },
    /**
     * Keeps the row at the top of the screen in place when rows are added or
     * removed anywhere above it.
     *
     * The name is the library's: it means "hold position relative to the item
     * at the scroll offset" whenever the row count or the first or last key
     * changes. Appending a page below changes nothing on screen; a folder from
     * a later page, inserted above, moves the scroll position by its height
     * instead of moving the rows.
     */
    anchorTo: 'end',
  });

  useRememberScroll(listingKey, virtualizer, initialOffset);
  useSelectionKeys(allItems);

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  useMeasureScrollMargin(bodyRef, margin, virtualizer.isScrolling, totalSize, desktop);

  usePrefetchNextPage(virtualizer, { complete, nextPage, onLoadMore, scrollMargin });

  const announcement = useLoadedAnnouncement(allItems.length, complete);

  // Focus tracking for the range extractor above.
  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-row-key]');
    if (!row?.dataset.rowKey) return;
    focused.current = { key: row.dataset.rowKey, index: Number(row.dataset.index) };
  };

  return (
    <div className="w-full mt-8 relative" onDragOver={onDragOver} onDrop={onDrop}>
      {/* Behind the rows, not over them: a folder highlighting itself as the
          drop target has to stay legible through this. */}
      {isDropTarget ? (
        <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-primary bg-primary/5" />
      ) : null}

      <div className="flex min-h-9 items-center justify-end mb-3">
        <LayoutToggle />
      </div>

      <div role="table" aria-label={label} aria-rowcount={complete ? rows.length : -1}>
        {desktop ? (
          // Column labels for sighted users. Each row's button already names
          // the item, so this is hidden rather than announced as a header row
          // whose columns the rows do not have.
          <div
            aria-hidden="true"
            className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-3.5 text-sm font-medium text-muted-foreground border-b border-border/50"
          >
            <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4">
              Name
            </div>
            <div className="hidden sm:block sm:col-span-2 md:col-span-2 lg:col-span-3 xl:col-span-3">
              Last Opened
            </div>
            <div className="hidden lg:block lg:col-span-2 xl:col-span-2">Owner</div>
            <div className="hidden xl:block xl:col-span-2">Size</div>
            <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1"></div>
          </div>
        ) : folders.length === 0 ? (
          // "Files" would be a lie above a list that opens with folders.
          <div
            aria-hidden="true"
            className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50"
          >
            Files
          </div>
        ) : null}

        <div
          ref={bodyRef}
          role="rowgroup"
          onFocus={handleFocus}
          // Rows are placed by transform, which the browser's own scroll
          // anchoring cannot see; the virtualizer does that job instead.
          style={{ height: totalSize, position: 'relative', overflowAnchor: 'none' }}
        >
          {items.map((item) => {
            const row = rows[item.index]!;
            return (
              <div
                key={item.key}
                role="row"
                aria-rowindex={item.index + 1}
                data-index={item.index}
                data-row-key={row.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: item.size,
                  transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <RowContent
                  row={row}
                  desktop={desktop}
                  lastIndex={allItems.length - 1}
                  allItems={allItems}
                  files={files}
                  nextPage={nextPage}
                  onLoadMore={onLoadMore}
                  onFolderClick={onFolderClick}
                  onFolderMenuClick={onFolderMenuClick}
                  onFileClick={onFileClick}
                  onFileAction={onFileAction}
                  onFilesDroppedToFolder={onFilesDroppedToFolder}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

interface RowContentProps {
  row: ListRow;
  desktop: boolean;
  lastIndex: number;
  allItems: (Folder | FileItem)[];
  files: FileItem[];
  nextPage: PageState;
  onLoadMore?: () => void;
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onFilesDroppedToFolder?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

/**
 * What one row draws. Memoized so scrolling, which re-renders the list to move
 * rows, re-renders only the rows that come into view.
 */
const RowContent = memo(function RowContent({
  row,
  desktop,
  lastIndex,
  allItems,
  files,
  nextPage,
  onLoadMore,
  onFolderClick,
  onFolderMenuClick,
  onFileClick,
  onFileAction,
  onFilesDroppedToFolder,
}: RowContentProps) {
  switch (row.kind) {
    case 'folder': {
      const { folder } = row;
      const path = folder.Prefix || folder.name;
      return (
        <div role="cell" className={desktop ? 'h-full' : 'h-full border-b border-border/30'}>
          <FolderDropTarget
            folder={{ id: path, name: folder.name, path }}
            onFilesDropped={onFilesDroppedToFolder}
          >
            {desktop ? (
              <FolderItemList
                folder={folder}
                index={row.index}
                allItems={allItems}
                onClick={onFolderClick}
                onMenuClick={onFolderMenuClick}
              />
            ) : (
              <FolderItemMobile
                folder={folder}
                index={row.index}
                allFolders={allItems}
                onFolderClick={onFolderClick}
              />
            )}
          </FolderDropTarget>
        </div>
      );
    }

    case 'file': {
      const isLast = row.index === lastIndex;
      return desktop ? (
        <div role="cell" className="relative h-full">
          <FileItemList
            file={row.file}
            allFiles={allItems}
            previewFiles={files}
            _onAction={onFileAction}
            index={row.index}
          />
          {isLast ? null : (
            <div className="absolute inset-x-4 bottom-0" aria-hidden="true">
              <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
            </div>
          )}
        </div>
      ) : (
        <div role="cell" className={isLast ? 'h-full' : 'h-full border-b border-border/30'}>
          <FileItemMobile
            file={row.file}
            allFiles={allItems}
            index={row.index}
            onFileClick={onFileClick}
            _onAction={onFileAction}
          />
        </div>
      );
    }

    case 'folders-note':
      return (
        <div role="cell" className="h-full">
          <FoldersNote />
        </div>
      );

    case 'more':
      return (
        <div role="cell" className="h-full">
          <MoreRow nextPage={nextPage} onLoadMore={onLoadMore} />
        </div>
      );
  }
});
