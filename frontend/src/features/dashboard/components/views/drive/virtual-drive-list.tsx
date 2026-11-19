'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Virtualizer,
} from '@tanstack/react-virtual';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import type { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import type { PageState } from '@/context/folder-listing';
import { useDriveStore } from '@/context/data-context';
import { DESKTOP_LIST_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { FolderDropTarget } from '@/features/upload/components/folder-drop-target';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useListingDrop } from '@/features/dashboard/hooks/use-listing-drop';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { FileItemList } from '../../ui/items/file-item-list';
import { FileItemMobile } from '../../ui/items/file-item-mobile';
import { FolderItemList } from '../../ui/items/folder-item-list';
import { FolderItemMobile } from '../../ui/items/folder-item-mobile';
import { listRows, rowHeight, type ListRow } from './list-rows';

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

/** How close to the loaded end, in screens, before the next page is read. */
const PREFETCH_SCREENS = 2;
/**
 * Rows drawn beyond each edge of the screen: enough that wheel scrolling never
 * shows a gap, few enough that a jump across the list mounts one screenful.
 */
const OVERSCAN = 6;
/** The fewest milliseconds between two "items loaded" announcements. */
const ANNOUNCE_EVERY_MS = 2000;

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

/**
 * Jumps rather than glides.
 *
 * `<main>` has `scroll-behavior: smooth`, which every `scrollTo` without a
 * behavior inherits. The virtualizer writes the scroll position to keep rows in
 * place, and a write that animates is the very jump it exists to prevent.
 */
function scrollInstantly(
  offset: number,
  { adjustments = 0, behavior }: { adjustments?: number; behavior?: ScrollBehavior },
  instance: Virtualizer<HTMLElement, Element>
) {
  instance.scrollElement?.scrollTo?.({
    top: offset + adjustments,
    behavior: behavior === 'smooth' ? 'smooth' : 'instant',
  });
}

/** Says how much has loaded, at most every couple of seconds. Silent on mount. */
function useLoadedAnnouncement(count: number, complete: boolean): string {
  const [text, setText] = useState('');
  const first = useRef(true);
  const last = useRef(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    const message = complete
      ? `All ${count.toLocaleString()} items loaded`
      : `${count.toLocaleString()} items loaded`;
    const wait = ANNOUNCE_EVERY_MS - (Date.now() - last.current);
    const say = () => {
      last.current = Date.now();
      setText(message);
    };

    if (wait <= 0) {
      say();
      return;
    }

    const timer = setTimeout(say, wait);
    return () => clearTimeout(timer);
  }, [count, complete]);

  return text;
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
  const clearSelection = useMultiSelectStore((state) => state.clearSelection);
  const rememberScrollOffset = useDriveStore((state) => state.rememberScrollOffset);

  const rows = useMemo(() => listRows(folders, files, complete), [folders, files, complete]);
  // What shift-select slices: folders then files, the order they are drawn in.
  const allItems = useMemo<(Folder | FileItem)[]>(() => [...folders, ...files], [folders, files]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(
    () => bodyRef.current?.closest<HTMLElement>('main') ?? null,
    []
  );

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

  /** Where the rows start within `<main>`'s scrolling content. */
  const [scrollMargin, setScrollMargin] = useState(0);

  const initialOffset = useRef(initialScrollOffset).current;

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

  /**
   * Where the user was, kept for when they come back.
   *
   * The virtualizer's own record of the last scroll event, not `<main>` read
   * at unmount: by then the next folder's rows are in the DOM and the browser
   * may already have clamped `scrollTop` to fit them. Nor a listener of our
   * own, which would run after the virtualizer has re-rendered the rows and
   * force the browser to lay them all out on the spot to answer it.
   */
  useEffect(() => {
    if (!listingKey) return;
    return () => rememberScrollOffset(listingKey, virtualizer.scrollOffset ?? initialOffset);
  }, [listingKey, rememberScrollOffset, virtualizer, initialOffset]);

  // Escape clears the selection, as it does over every other listing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const rangeEnd = virtualizer.range?.endIndex ?? -1;

  /**
   * `scrollMargin` follows whatever sits above the list: banners, breadcrumb,
   * header.
   *
   * Not measured on every scroll. Reading layout straight after the rows for a
   * new screen are committed forces the browser to lay them out there and
   * then, and that was the largest single cost of a jump across the list.
   * Instead it is measured when the list's own size changes, and otherwise
   * once the scrolling stops, when a frame's work no longer matters. Between
   * the two, a stale margin only shifts which rows count as near the screen,
   * which the overscan absorbs; rows are positioned within the list, so none
   * are drawn in the wrong place.
   */
  const isScrolling = virtualizer.isScrolling;
  useLayoutEffect(() => {
    if (isScrolling) return;

    const body = bodyRef.current;
    const main = getScrollElement();
    if (!body || !main) return;

    const mainRect = main.getBoundingClientRect();
    // Nothing laid out yet, or no layout at all (jsdom).
    if (mainRect.height === 0) return;

    const margin = Math.round(body.getBoundingClientRect().top - mainRect.top + main.scrollTop);
    if (margin !== scrollMargin) setScrollMargin(margin);
  }, [getScrollElement, scrollMargin, isScrolling, totalSize, desktop]);

  /**
   * Reads the next page once the user is within two screens of the loaded end.
   *
   * Runs again whenever the visible range moves or a page lands, so a page
   * that leaves the user still near the end asks for the one after it. Never
   * after a failure: that waits for the retry row.
   */
  useEffect(() => {
    if (complete || nextPage.status !== 'idle' || !onLoadMore) return;

    const viewport = virtualizer.scrollRect?.height ?? window.innerHeight;
    const offset = (virtualizer.scrollOffset ?? 0) - scrollMargin;
    const remaining = totalSize - (offset + viewport);

    if (remaining <= viewport * PREFETCH_SCREENS) onLoadMore();
  }, [complete, nextPage.status, onLoadMore, rangeEnd, totalSize, scrollMargin, virtualizer]);

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
        <div role="cell" className="flex h-full items-center px-4 text-xs text-muted-foreground">
          More folders may still appear as the rest of this folder loads.
        </div>
      );

    case 'more':
      return nextPage.status === 'error' ? (
        <div
          role="cell"
          className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
        >
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
      ) : (
        <div
          role="cell"
          className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading more…</span>
        </div>
      );
  }
});
