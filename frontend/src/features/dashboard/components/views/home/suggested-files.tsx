'use client';

import { useState, Fragment } from 'react';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useCurrentLayout } from '@/hooks/use-current-layout';
import type { FileItem } from '@/features/dashboard/types/file';
import { FileItemGrid, FileItemList, FileItemMobile } from '../../ui';

interface SuggestedFilesProps {
  files: FileItem[];
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onViewMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  className?: string;
  hideTitle?: boolean;
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
}: SuggestedFilesProps) {
  const { layout } = useCurrentLayout();
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleFileClick = (file: FileItem) => {
    onFileClick?.(file);
  };

  const handleFileAction = (action: string, file: FileItem) => {
    onFileAction?.(action, file);
  };

  if (files.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-muted-foreground">No files available.</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {!hideTitle ? (
        <div className="flex items-center justify-between mb-3">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Suggested files
          </button>

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
              {files.map((file) => (
                <div
                  key={file.Key}
                  onClick={() => handleFileClick(file)}
                  className="cursor-pointer"
                >
                  <FileItemGrid file={file} _onAction={handleFileAction} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {/* Desktop List View */}
              <div className="hidden sm:block space-y-1">
                {/* Header with responsive grid matching file items */}
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                  {/* Name - always visible, responsive sizing */}
                  <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-4 xl:col-span-4">
                    Name
                  </div>

                  {/* Last Opened - visible from sm up */}
                  <div className="hidden sm:block sm:col-span-2 md:col-span-2 lg:col-span-3 xl:col-span-3">
                    Last Opened
                  </div>

                  {/* Owner - visible from lg up */}
                  <div className="hidden lg:block lg:col-span-2 xl:col-span-2">Owner</div>

                  {/* Size - visible from xl up */}
                  <div className="hidden xl:block xl:col-span-2">Size</div>

                  {/* Menu space - always visible */}
                  <div className="col-span-2 sm:col-span-1 md:col-span-2 lg:col-span-1 xl:col-span-1"></div>
                </div>

                {files.map((file, index) => (
                  <Fragment key={file.Key}>
                    <div onClick={() => handleFileClick(file)} className="cursor-pointer">
                      <FileItemList file={file} allFiles={files} _onAction={handleFileAction} />
                    </div>
                    {/* Professional separator */}
                    {index < files.length - 1 && (
                      <div className="mx-4" aria-hidden="true">
                        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>

              {/* Mobile List View */}
              <div className="sm:hidden">
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                  Files
                </div>
                <div className="divide-y divide-border/30">
                  {files.map((file) => (
                    <FileItemMobile
                      key={file.Key}
                      file={file}
                      allFiles={files}
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
