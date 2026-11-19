'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  defaultRangeExtractor,
  measureElement,
  useVirtualizer,
  type Range,
  type Virtualizer,
} from '@tanstack/react-virtual';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import type { DragDropTarget } from '@/features/upload/types/drag-drop-types';
import type { PageState } from '@/context/folder-listing';
import { itemKey } from '@/shared/utils/drive-item';
import { FolderDropTarget } from '@/features/upload/components/folder-drop-target';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useListingDrop } from '@/features/dashboard/hooks/use-listing-drop';
import { FileItemGrid } from '../../ui/items/file-item-grid';
import { FolderItem } from '../../ui/items/folder-item';
import { columnsFor, gridRows, moveFocus, type GridRow, type Section } from './grid-rows';
import {
  FoldersNote,
  MoreRow,
  scrollInstantly,
  scrollParentOf,
  useLoadedAnnouncement,
  useMeasureScrollMargin,
  usePrefetchNextPage,
  useRememberScroll,
  useSelectionKeys,
} from './virtual-shared';

/**
 * One folder in grid view, drawing only the rows of cards near the screen.
 *
 * The same scheme as the list: a spacer as tall as the whole grid inside the
 * dashboard's `<main>`, the next page read within two screens of the loaded
 * end, folders above files with the screen held still when a later page adds
 * one. What differs is the shape. Cards are cut into rows as wide as the
 * container allows, the Folders and Files headings are rows of the same list,
 * and rows are measured rather than fixed, because a card's height is the
 * card's to decide.
 *
 * Arrow keys move between cards, scrolling the next one into view; the card
 * with focus is drawn wherever the grid has scrolled to.
 */

/** Rows drawn beyond each edge of the screen. File rows are tall. */
const OVERSCAN = 3;
/** The sticky folder header covers this much of the top of `<main>`. */
const STICKY_HEADER = 96;
/** How long the container's width has to hold before the columns follow it. */
const WIDTH_SETTLE_MS = 150;

/** A row's shape, for sizing: the files heading has space above it, the folders heading none. */
type Shape = Exclude<GridRow['kind'], 'heading'> | 'heading-folders' | 'heading-files';
const shapeOf = (row: GridRow): Shape =>
  row.kind === 'heading' ? `heading-${row.section}` : row.kind;

/** What a row is taken to measure before any of its shape has been drawn. */
const ESTIMATE: Record<Shape, number> = {
  'heading-folders': 48,
  'heading-files': 80,
  folders: 76,
  files: 241,
  'folders-note': 40,
  more: 64,
};

/**
 * What rows of each shape have measured, for the rows not drawn yet.
 *
 * Every row of one shape is the same height: the cards are fixed-size and
 * their text truncates. So the first one measured says what all the others
 * are, and positions far above the screen come out exact rather than off by
 * a pixel a row - which, a few thousand rows down, was a visible jump when
 * coming back to a folder. Kept for the session, so a folder reopened by Back
 * is laid out right from its first frame.
 */
const learnedSizes = new Map<Shape, number>();
const ARROWS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

interface VirtualDriveGridProps {
  folders: Folder[];
  files: FileItem[];
  complete: boolean;
  nextPage: PageState;
  onLoadMore?: () => void;
  listingKey?: string;
  initialScrollOffset?: number;
  label?: string;
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onFilesDropped?: (processedData: ProcessedDragData) => void;
  onFilesDroppedToFolder?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

/**
 * The container's width, kept current. Starts from a guess, so the first
 * render already has roughly the right number of columns, and is corrected
 * before the browser paints.
 */
function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : Math.max(0, window.innerWidth - 320)
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const read = () => {
      // jsdom, or not laid out yet: keep the last real answer.
      if (element.clientWidth > 0) setWidth(element.clientWidth);
    };
    read();

    if (typeof ResizeObserver === 'undefined') return;
    /**
     * Only once the width holds. The dashboard animates its content area when
     * the sidebar opens, closes or changes mode, and following every frame of
     * that flipped the column count back and forth, re-cutting every row each
     * time. The cards stretch for a moment instead.
     */
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(read, WIDTH_SETTLE_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [ref]);

  return width;
}

const NO_COLLAPSE: Readonly<Record<Section, boolean>> = { folders: false, files: false };

export function VirtualDriveGrid({
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
  onFileAction,
  onFilesDropped,
  onFilesDroppedToFolder,
}: VirtualDriveGridProps) {
  const { isDropTarget, onDragOver, onDrop } = useListingDrop(onFilesDropped);

  const bodyRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => scrollParentOf(bodyRef), []);
  const columns = columnsFor(useContainerWidth(bodyRef));
  const [collapsed, setCollapsed] = useState(NO_COLLAPSE);

  const { rows, rowOf } = useMemo(
    () => gridRows(folders, files, complete, columns, collapsed),
    [folders, files, complete, columns, collapsed]
  );
  // What shift-select slices and focus moves through: folders then files.
  const allItems = useMemo<(Folder | FileItem)[]>(() => [...folders, ...files], [folders, files]);

  const toggleSection = useCallback(
    (section: Section) => setCollapsed((current) => ({ ...current, [section]: !current[section] })),
    []
  );

  /**
   * The card with focus is always drawn, wherever the grid has scrolled to,
   * and so is the card an arrow key is on its way to.
   */
  const focused = useRef<{ key: string; index: number } | null>(null);
  const latest = useRef({ allItems, rowOf });
  latest.current = { allItems, rowOf };

  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range);
    const held = focused.current;
    if (!held || indexes.length === 0) return indexes;

    const { allItems: items, rowOf: rowOfItem } = latest.current;
    let index = held.index;
    const at = items[index];
    if (!at || itemKey(at) !== held.key) {
      index = items.findIndex((item) => itemKey(item) === held.key);
      if (index < 0) {
        focused.current = null;
        return indexes;
      }
      held.index = index;
    }

    const row = rowOfItem(index);
    if (row < 0) return indexes;
    if (row < indexes[0]!) return [row, ...indexes];
    if (row > indexes[indexes.length - 1]!) return [...indexes, row];
    return indexes;
  }, []);

  const estimateSize = useCallback(
    (i: number) => {
      const shape = shapeOf(rows[i]!);
      return learnedSizes.get(shape) ?? ESTIMATE[shape];
    },
    [rows]
  );
  const measureRow = useCallback(
    (
      element: Element,
      entry: ResizeObserverEntry | undefined,
      instance: Virtualizer<HTMLElement, Element>
    ) => {
      const size = measureElement(element, entry, instance);
      const shape = (element as HTMLElement).dataset.shape as Shape | undefined;
      if (shape && size > 0) learnedSizes.set(shape, size);
      return size;
    },
    []
  );
  const getItemKey = useCallback((i: number) => rows[i]!.key, [rows]);

  const initialOffset = useRef(initialScrollOffset).current;
  const margin = useState(0);

  const virtualizer = useVirtualizer<HTMLElement, Element>({
    count: rows.length,
    getScrollElement,
    estimateSize,
    measureElement: measureRow,
    getItemKey,
    overscan: OVERSCAN,
    scrollMargin: margin[0],
    rangeExtractor,
    scrollToFn: scrollInstantly,
    initialOffset,
    initialRect: { width: 0, height: typeof window === 'undefined' ? 800 : window.innerHeight },
    // Room for the sticky header when a card is scrolled into view.
    scrollPaddingStart: STICKY_HEADER,
    scrollPaddingEnd: 16,
    // As in the list: hold the row at the top of the screen still when rows
    // are added or removed above it.
    anchorTo: 'end',
  });

  useRememberScroll(listingKey, virtualizer, initialOffset);
  useSelectionKeys(allItems);

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  useMeasureScrollMargin(bodyRef, margin, virtualizer.isScrolling, totalSize, columns);
  usePrefetchNextPage(virtualizer, {
    complete,
    nextPage,
    onLoadMore,
    scrollMargin: margin[0],
  });

  /**
   * A change of column count re-cuts every row, so no row survives for the
   * virtualizer to hold still. Instead the first card the user can see - in
   * the first row that is mostly below the sticky header - is put back at the
   * same height on screen.
   *
   * Two effects, in this order: the first reads where that card was as of the
   * last commit, the second records it for the next one.
   */
  const topCard = useRef<{ index: number; delta: number } | null>(null);
  const shownColumns = useRef(columns);
  useLayoutEffect(() => {
    if (shownColumns.current === columns) return;
    shownColumns.current = columns;

    const card = topCard.current;
    if (!card) return;
    const row = rowOf(card.index);
    const start = row < 0 ? undefined : virtualizer.measurementsCache[row]?.start;
    if (start !== undefined) virtualizer.scrollToOffset(Math.max(0, start - card.delta));
  }, [columns, rowOf, virtualizer]);

  useLayoutEffect(() => {
    const offset = virtualizer.scrollOffset ?? 0;
    const seen = offset + STICKY_HEADER;
    for (const item of virtualizer.getVirtualItems()) {
      const row = rows[item.index];
      if (row && 'start' in row && item.start + item.size / 2 > seen) {
        topCard.current = { index: row.start, delta: item.start - offset };
        return;
      }
    }
  });

  const announcement = useLoadedAnnouncement(allItems.length, complete);

  /** Focuses a card if it is drawn. */
  const focusCard = useCallback((index: number) => {
    const card = bodyRef.current?.querySelector<HTMLElement>(
      `[data-item-index="${index}"] [role="button"][tabindex="0"]`
    );
    if (!card) return false;
    card.focus({ preventScroll: true });
    return true;
  }, []);

  /** An arrow key's destination, focused once the scroll has drawn it. */
  const pendingFocus = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocus.current !== null && focusCard(pendingFocus.current)) {
      pendingFocus.current = null;
    }
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ARROWS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;

    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-item-index]');
    // From a card, not from its menu button, which has arrow keys of its own.
    if (!cell || event.target !== cell.querySelector('[role="button"][tabindex="0"]')) return;

    event.preventDefault();
    const to = moveFocus(
      Number(cell.dataset.itemIndex),
      event.key,
      folders.length,
      files.length,
      columns,
      collapsed
    );
    if (to === null) return;

    const target = allItems[to]!;
    focused.current = { key: itemKey(target), index: to };
    virtualizer.scrollToIndex(rowOf(to), { align: 'auto' });
    if (!focusCard(to)) pendingFocus.current = to;
  };

  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-item-index]');
    if (!cell?.dataset.itemKey) return;
    focused.current = { key: cell.dataset.itemKey, index: Number(cell.dataset.itemIndex) };
  };

  // Whichever section comes first carries the layout toggle, so switching
  // from list to grid leaves it under the pointer.
  const toggleIn: Section | null =
    folders.length > 0 ? 'folders' : files.length > 0 ? 'files' : null;

  return (
    <div className="w-full mt-8 relative" onDragOver={onDragOver} onDrop={onDrop}>
      {isDropTarget ? (
        <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-primary bg-primary/5" />
      ) : null}

      {toggleIn === null ? (
        <div className="flex min-h-9 items-center justify-end mb-3">
          <LayoutToggle />
        </div>
      ) : null}

      <div
        role="grid"
        aria-label={label}
        aria-rowcount={complete ? rows.length : -1}
        aria-colcount={columns}
      >
        <div
          ref={bodyRef}
          role="rowgroup"
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          style={{ height: totalSize, position: 'relative', overflowAnchor: 'none' }}
        >
          {items.map((item) => {
            const row = rows[item.index]!;
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                role="row"
                aria-rowindex={item.index + 1}
                data-index={item.index}
                data-shape={shapeOf(row)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <GridRowContent
                  row={row}
                  columns={columns}
                  collapsed={row.kind === 'heading' ? collapsed[row.section] : false}
                  showToggle={row.kind === 'heading' && row.section === toggleIn}
                  spaced={row.kind === 'heading' && row.section === 'files' && folders.length > 0}
                  allItems={allItems}
                  files={files}
                  nextPage={nextPage}
                  onLoadMore={onLoadMore}
                  onToggleSection={toggleSection}
                  onFolderClick={onFolderClick}
                  onFolderMenuClick={onFolderMenuClick}
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

interface GridRowContentProps {
  row: GridRow;
  columns: number;
  /** For a heading: its section is folded away. */
  collapsed: boolean;
  /** For a heading: it carries the layout toggle. */
  showToggle: boolean;
  /** For a heading: space above it, from the section before. */
  spaced: boolean;
  allItems: (Folder | FileItem)[];
  files: FileItem[];
  nextPage: PageState;
  onLoadMore?: () => void;
  onToggleSection: (section: Section) => void;
  onFolderClick?: (folder: Folder) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onFilesDroppedToFolder?: (processedData: ProcessedDragData, targetFolder: DragDropTarget) => void;
}

/**
 * What one row draws. Memoized so scrolling, which re-renders the grid to
 * move rows, re-renders only the rows that come into view.
 */
const GridRowContent = memo(function GridRowContent({
  row,
  columns,
  collapsed,
  showToggle,
  spaced,
  allItems,
  files,
  nextPage,
  onLoadMore,
  onToggleSection,
  onFolderClick,
  onFolderMenuClick,
  onFileAction,
  onFilesDroppedToFolder,
}: GridRowContentProps) {
  const template = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };

  switch (row.kind) {
    case 'heading': {
      const title = row.section === 'folders' ? 'Folders' : 'Files';
      return (
        <div
          role="columnheader"
          aria-colspan={columns}
          className={`flex min-h-9 items-center justify-between pb-3 ${spaced ? 'pt-8' : ''}`}
        >
          <button
            type="button"
            onClick={() => onToggleSection(row.section)}
            aria-expanded={!collapsed}
            className="flex items-center cursor-pointer gap-2 p-2 text-sm font-medium text-foreground hover:bg-secondary/80 rounded-lg transition-colors duration-200"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-0' : 'rotate-90'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {title}
          </button>
          {showToggle ? <LayoutToggle /> : null}
        </div>
      );
    }

    case 'folders':
      return (
        <div className="grid gap-3 pb-3" style={template}>
          {row.items.map((folder, column) => {
            const index = row.start + column;
            const path = folder.Prefix || folder.name;
            return (
              <div
                key={path}
                role="gridcell"
                aria-colindex={column + 1}
                data-item-index={index}
                data-item-key={itemKey(folder)}
              >
                <FolderDropTarget
                  folder={{ id: path, name: folder.name, path }}
                  onFilesDropped={onFilesDroppedToFolder}
                  className="rounded-lg"
                >
                  <FolderItem
                    folder={folder}
                    index={index}
                    allFolders={allItems}
                    onClick={onFolderClick}
                    onMenuClick={onFolderMenuClick}
                  />
                </FolderDropTarget>
              </div>
            );
          })}
        </div>
      );

    case 'files':
      return (
        <div className="grid gap-4 pb-4" style={template}>
          {row.items.map((file, column) => {
            const index = row.start + column;
            return (
              <div
                key={file.Key}
                role="gridcell"
                aria-colindex={column + 1}
                data-item-index={index}
                data-item-key={itemKey(file)}
              >
                <FileItemGrid
                  file={file}
                  allFiles={files}
                  rangeItems={allItems}
                  index={index}
                  _onAction={onFileAction}
                />
              </div>
            );
          })}
        </div>
      );

    case 'folders-note':
      return (
        <div role="gridcell" aria-colspan={columns} className="h-10">
          <FoldersNote />
        </div>
      );

    case 'more':
      return (
        <div role="gridcell" aria-colspan={columns} className="h-16">
          <MoreRow nextPage={nextPage} onLoadMore={onLoadMore} />
        </div>
      );
  }
});
