'use client';

import { useState, Fragment, useEffect, Children } from 'react';
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
import { useEnhancedDragDrop } from '@/features/upload/providers/enhanced-drag-drop-provider';
import { isExternalFileDrag } from '@/features/upload/utils/drag-events';

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
   * The same rows in their mobile form.
   *
   * The list view renders two trees, one per breakpoint, and only one is ever
   * visible. Handing folder rows to the desktop tree alone made them vanish
   * below `sm`, which on a folder-only prefix left the page blank.
   */
  leadingMobileRows?: React.ReactNode;
  /**
   * How many rows precede the files, so a file's index describes its place in
   * the table rather than in the files array. Shift-select slices `allItems` by
   * these numbers, so being off by the folder count selects the wrong rows.
   */
  fileIndexOffset?: number;
  /** Folders and files together, the range a shift-select can span. */
  allItems?: (FileItem | Folder)[];
  /**
   * Leave the layout toggle to whichever section leads the page.
   *
   * This table owned it in both layouts, and in grid it is the second section,
   * so switching from list to grid moved the toggle down past the whole folder
   * grid - out from under the pointer that had just clicked it. In grid the
   * folders section renders it instead; here it would be a second copy.
   */
  hideLayoutToggle?: boolean;
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
  leadingMobileRows,
  fileIndexOffset = 0,
  allItems,
  hideLayoutToggle = false,
}: SuggestedFilesProps) {
  const { layout } = useCurrentLayout();
  const [isExpanded, setIsExpanded] = useState(true);
  const { clearSelection } = useMultiSelectStore();
  /**
   * The drag is one fact about the page, so one listener at the window owns it.
   *
   * It used to be tracked here, by counting dragenter against dragleave. Both
   * fire once per descendant, so a table of rows full of icons and buttons
   * emits them in bursts and the count drifts - the wash would stick on after
   * the pointer left, or never appear at all.
   */
  const { isFileDragActive, hoveredTargetId } = useEnhancedDragDrop();

  /**
   * The listing is the destination only while no folder in it is.
   *
   * Drawing this at the same time as a folder row's own highlight would offer
   * two answers to where the files are about to land. A folder claiming the
   * drop is the more specific answer, so it wins and this steps back.
   */
  const isDropTarget = isFileDragActive && hoveredTargetId === null;

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

  /**
   * No stopPropagation here.
   *
   * Stopping the drag events on the way up is what broke dropping onto a folder
   * once folders moved into this table: the window listener that tracks the
   * drag sits above this component, so a drag that began over the rows was
   * never seen at all, and every folder in the list stayed inert for the rest
   * of it.
   */
  const handleDragOver = (e: React.DragEvent) => {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!isExternalFileDrag(e.dataTransfer)) return;

    e.preventDefault();

    // A drop on a folder row never reaches here - the row stops it - so
    // anything that does was aimed at the listing, and belongs in the prefix
    // the listing is showing.
    if (!onFilesDropped) return;

    try {
      const processedData = await FolderStructureProcessor.processDataTransferItems(
        e.dataTransfer.items
      );

      onFilesDropped(processedData);
    } catch (error) {
      console.error('Error processing drag and drop:', error);
    }
  };

  const handleFileClick = (file: FileItem) => {
    onFileClick?.(file);
  };

  const handleFileAction = (action: string, file: FileItem) => {
    onFileAction?.(action, file);
  };

  // Empty means nothing to show at all, not merely no files. Once folders
  // render as leading rows in this same table, asking only about `files` put
  // the drop zone in front of a folder that has subfolders and no files in it -
  // a directory with contents, drawn as an empty one.
  if (files.length === 0 && Children.count(leadingRows) === 0) {
    return (
      <div
        className={cn(`w-full ${className} transition-all duration-200 relative text-center`)}
        style={{ minHeight: '300px' }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDropTarget ? (
          <div className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-dashed border-primary bg-primary/5" />
        ) : null}

        {/* An empty directory still gets the layout control. Without it, opening
            one in grid view left no way back to list until the user navigated
            somewhere with contents. */}
        {hideLayoutToggle ? null : (
          <div className="relative z-20 flex min-h-9 items-center justify-end mb-3">
            <LayoutToggle />
          </div>
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
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Behind the rows, not over them: a folder highlighting itself as the
          drop target has to stay legible through this. */}
      {isDropTarget ? (
        <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-primary bg-primary/5" />
      ) : null}
      {/* min-h-9 is the heading button's height, held whether or not there is a
          heading, so the layout toggle sits at the same y in both layouts. */}
      {!hideTitle ? (
        <div className="flex min-h-9 items-center justify-between mb-3">
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

          {isExpanded && !hideLayoutToggle ? <LayoutToggle /> : null}
        </div>
      ) : (
        <div className="flex min-h-9 items-center justify-end mb-3">
          {hideLayoutToggle ? null : <LayoutToggle />}
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
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-3.5 text-sm font-medium text-muted-foreground border-b border-border/50">
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
                {/* "Files" would be a lie above a list that opens with folders,
                    the same reason the desktop table drops its heading. */}
                {Children.count(leadingMobileRows) === 0 && (
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                    Files
                  </div>
                )}
                <div className="divide-y divide-border/30">
                  {leadingMobileRows}
                  {files.map((file, index) => (
                    <FileItemMobile
                      key={file.Key}
                      file={file}
                      allFiles={allItems ?? files}
                      index={index + fileIndexOffset}
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
