'use client';

import { useState, Fragment, useRef, useEffect } from 'react';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useCurrentLayout } from '@/hooks/use-current-layout';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { FileItemGrid, FileItemList, FileItemMobile } from '../../ui';
import { cn } from '@/shared/utils/utils';
import { FolderStructureProcessor } from '@/features/upload/utils/folder-structure-processor';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SortDirection } from '@/features/dashboard/utils/sort-items';

interface SuggestedFilesProps {
  files: FileItem[];
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onViewMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  className?: string;
  hideTitle?: boolean;
  onFilesDropped?: (processedData: ProcessedDragData) => void;
  /**
   * Sorting, supplied only by the browse view.
   *
   * Home lists recent activity and is already ordered by when things were
   * touched; offering to re-order it by name would be offering to throw away
   * the one thing that page is for. Absent these props the heading is plain
   * text, exactly as it was.
   */
  /**
   * What this section is called.
   *
   * These components were written for Home and then reused wholesale by My
   * Drive, heading and all - so the browse tree announced the literal contents
   * of a bucket as "Suggested files". Nothing about a folder listing is a
   * suggestion. Home keeps the suggesting; browse passes its own plain label.
   */
  title?: string;
  /**
   * Rows rendered above the files, under the same header.
   *
   * How the list view shows one directory instead of two: DriveList hands the
   * folder rows in here rather than stacking a second table above this one.
   * Absent - on Home, and in grid layout - nothing changes.
   */
  leadingRows?: React.ReactNode;
  /**
   * How many rows precede the files, so a file's index describes its place in
   * the table rather than in the files array. Shift-select slices `allItems` by
   * these numbers, so being off by the folder count selects the wrong rows.
   */
  fileIndexOffset?: number;
  /** Folders and files together, the range a shift-select can span. */
  allItems?: (FileItem | Folder)[];
  sortDirection?: SortDirection;
  onToggleSort?: () => void;
  /** False while the folder still has pages the listing has not fetched. */
  canSortDescending?: boolean;
}

export function SuggestedFiles({
  files,
  onFileClick,
  onFileAction,
  onViewMore,
  hasMore = false,
  isLoadingMore = false,
  className = '',
  hideTitle = false,
  onFilesDropped,
  title = 'Suggested files',
  leadingRows,
  fileIndexOffset = 0,
  allItems,
  sortDirection,
  onToggleSort,
  canSortDescending = true,
}: SuggestedFilesProps) {
  const { layout } = useCurrentLayout();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);
  const { clearSelection } = useMultiSelectStore();

  // Handle ESC key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragActive(false);
    dragCounter.current = 0;

    if (onFilesDropped && e.dataTransfer) {
      try {
        const dataTransfer = e.dataTransfer;
        const processedData = await FolderStructureProcessor.processDataTransferItems(
          dataTransfer.items
        );

        onFilesDropped(processedData);
      } catch (error) {
        console.error('Error processing drag and drop:', error);
      }
    }

    setTimeout(() => {
      setIsDragActive(false);
      dragCounter.current = 0;
    }, 100);
  };

  const handleFileClick = (file: FileItem) => {
    onFileClick?.(file);
  };

  const handleFileAction = (action: string, file: FileItem) => {
    onFileAction?.(action, file);
  };

  if (files.length === 0) {
    return (
      <div
        className={cn(`w-full ${className} transition-all duration-200 relative text-center`)}
        style={{ minHeight: '300px' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragActive && (
          <div className="absolute inset-0 bg-white/20 dark:bg-white/10 border-2 border-dashed border-primary rounded-lg pointer-events-none z-10 flex items-center justify-center"></div>
        )}
        <div className="flex flex-col items-center justify-center h-full py-16">
          <div className="w-16 h-16 mb-4 rounded-full bg-muted/30 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">No files in this folder</p>
          <p className="text-muted-foreground text-sm mt-2">Drag and drop files here to upload</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(`w-full ${className} transition-all duration-200 relative`)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragActive && (
        <div className="absolute inset-0 bg-white/20 dark:bg-white/10 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none z-10" />
      )}
      {!hideTitle ? (
        <div className="flex items-center justify-between mb-3">
          <AriaLabel label={`${title} - Click to expand/collapse`} position="top">
            <button
              className="
                flex items-center cursor-pointer gap-2 p-2
                text-sm font-medium text-foreground
                hover:bg-secondary/80 rounded-lg
                transition-colors duration-200
              "
              onClick={toggleExpanded}
              aria-expanded={isExpanded}
              aria-controls="suggested-files-content"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {title}
            </button>
          </AriaLabel>

          {isExpanded && <LayoutToggle />}
        </div>
      ) : (
        <div className="flex items-center justify-end mb-3">
          <LayoutToggle />
        </div>
      )}

      {(hideTitle || isExpanded) && (
        <div id="suggested-files-content">
          {layout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {files.map((file, index) => (
                <FileItemGrid
                  key={file.Key}
                  file={file}
                  allFiles={files}
                  _onAction={handleFileAction}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div>
              <div className="hidden sm:block space-y-1">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-3.5 items-center text-sm font-medium text-muted-foreground border-b border-border/50">
                  <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4">
                    {onToggleSort && sortDirection ? (
                      <SortByNameButton
                        direction={sortDirection}
                        canSortDescending={canSortDescending}
                        onToggle={onToggleSort}
                      />
                    ) : (
                      'Name'
                    )}
                  </div>
                  <div className="hidden sm:block sm:col-span-2 md:col-span-2 lg:col-span-3 xl:col-span-3">
                    Last modified
                  </div>
                  <div className="hidden lg:block lg:col-span-2 xl:col-span-2">Owner</div>
                  <div className="hidden xl:block xl:col-span-2">Size</div>
                  <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1"></div>
                </div>

                {leadingRows}

                {files.map((file, index) => (
                  <Fragment key={file.Key}>
                    <FileItemList
                      file={file}
                      allFiles={allItems ?? files}
                      _onAction={handleFileAction}
                      index={index + fileIndexOffset}
                    />
                    {index < files.length - 1 && (
                      <div className="mx-4" aria-hidden="true">
                        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>

              <div className="sm:hidden">
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                  Files
                </div>
                <div className="divide-y divide-border/30">
                  {files.map((file, index) => (
                    <FileItemMobile
                      key={file.Key}
                      file={file}
                      allFiles={files}
                      index={index}
                      onFileClick={handleFileClick}
                      _onAction={handleFileAction}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(hideTitle || isExpanded) && hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={onViewMore}
            disabled={isLoadingMore}
            className="px-4 py-2 text-sm cursor-pointer font-medium text-primary hover:bg-primary/20  hover:rounded-2xl  duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading...' : 'View More Files'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The Name heading, when the view offers sorting.
 *
 * Descending is refused while the folder is still truncated. S3 pages in key
 * order, so a partial listing is a truthful beginning of the ascending answer
 * but says nothing about the end - the last object in the bucket could belong
 * at the top, and no amount of reordering what has arrived would reveal it.
 * Disabled and explained rather than hidden, so the control does not appear to
 * come and go as folders load.
 */
function SortByNameButton({
  direction,
  canSortDescending,
  onToggle,
}: {
  direction: SortDirection;
  canSortDescending: boolean;
  onToggle: () => void;
}) {
  const ascending = direction === 'asc';
  // Only descending needs the whole folder, so the control locks solely when
  // the next press would ask for it.
  const blocked = ascending && !canSortDescending;
  const Arrow = ascending ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={blocked ? undefined : onToggle}
      disabled={blocked}
      aria-label={
        blocked
          ? 'Sorted A to Z. Z to A needs the whole folder loaded.'
          : `Sorted ${ascending ? 'A to Z' : 'Z to A'}. Sort ${ascending ? 'Z to A' : 'A to Z'}.`
      }
      title={
        blocked ? 'This folder has more to load, so it cannot be sorted Z to A yet.' : undefined
      }
      className={cn(
        // Fills the column rather than wrapping the word. A target the size of
        // the label is a target you have to aim at; the whole cell lighting up
        // is what tells you the heading is pressable at all.
        // w-full, not a negative-margin bleed: the hover surface should stop at
        // the column boundary, or it reaches under "Last modified" and the two
        // headings look like one control.
        // -ml matches px so "Name" still lines up with the rows beneath it; the
        // hover surface just starts further left. No negative -my here: it used to
        // cancel the vertical padding outright, which is why the cell felt cramped.
        'group flex w-full items-center gap-1.5 rounded-t-lg px-4 py-2 -ml-4 text-left text-sm font-medium transition-colors',
        blocked
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-secondary/70 hover:text-foreground'
      )}
    >
      Name
      {/* A filled disc, not a bare glyph. At this size a 1px stroke on a muted
          foreground is nearly invisible against the header, which is how the
          sort state ends up unreadable at a glance. */}
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors',
          blocked
            ? 'bg-muted-foreground/30 text-background'
            : 'bg-muted-foreground/70 text-background group-hover:bg-primary group-hover:text-primary-foreground'
        )}
      >
        <Arrow className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </span>
    </button>
  );
}
