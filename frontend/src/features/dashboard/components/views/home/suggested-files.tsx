'use client';

import { useState, Fragment, useRef } from 'react';
import { LayoutToggle } from '@/features/dashboard/components/ui/layout-toggle';
import { useCurrentLayout } from '@/hooks/use-current-layout';
import type { FileItem } from '@/features/dashboard/types/file';
import { FileItemGrid, FileItemList, FileItemMobile } from '../../ui';
import { cn } from '@/shared/utils/utils';

interface SuggestedFilesProps {
  files: FileItem[];
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  onViewMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  className?: string;
  hideTitle?: boolean;
  onFilesDropped?: (files: File[], folders: File[]) => void;
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
}: SuggestedFilesProps) {
  const { layout } = useCurrentLayout();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);

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

  const readDirectoryContents = async (
    directoryEntry: FileSystemDirectoryEntry
  ): Promise<File[]> => {
    return new Promise((resolve, reject) => {
      const files: File[] = [];
      const reader = directoryEntry.createReader();

      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files);
            return;
          }

          try {
            for (const entry of entries) {
              if (entry.isFile) {
                const fileEntry = entry as FileSystemFileEntry;
                const file = await new Promise<File>((resolveFile, rejectFile) => {
                  fileEntry.file(resolveFile, rejectFile);
                });

                const relativePath = entry.fullPath.substring(1);
                Object.defineProperty(file, 'webkitRelativePath', {
                  value: relativePath,
                  writable: false,
                });

                files.push(file);
              } else if (entry.isDirectory) {
                const subFiles = await readDirectoryContents(entry as FileSystemDirectoryEntry);
                files.push(...subFiles);
              }
            }

            readEntries();
          } catch (error) {
            reject(error);
          }
        }, reject);
      };

      readEntries();
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Immediately clear drag state
    setIsDragActive(false);
    dragCounter.current = 0;

    if (onFilesDropped && e.dataTransfer) {
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const files: File[] = [];
        const folders: File[] = [];

        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];

          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.();
            if (entry) {
              if (entry.isDirectory) {
                const file = item.getAsFile();
                if (file) {
                  folders.push(file);
                }
              } else if (entry.isFile) {
                const file = item.getAsFile();
                if (file) {
                  files.push(file);
                }
              }
            } else {
              const file = item.getAsFile();
              if (file) {
                files.push(file);
              }
            }
          }
        }

        if (folders.length > 0) {
          const allFolderFiles: File[] = [];

          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry?.();
              if (entry && entry.isDirectory) {
                const folderFiles = await readDirectoryContents(entry as FileSystemDirectoryEntry);
                allFolderFiles.push(...folderFiles);
              }
            }
          }

          onFilesDropped(files, allFolderFiles);
        } else {
          onFilesDropped(files, folders);
        }
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const allFiles = Array.from(e.dataTransfer.files);
        const files: File[] = [];
        const folders: File[] = [];

        allFiles.forEach((file) => {
          const fileWithPath = file as File & { webkitRelativePath?: string };

          if (fileWithPath.webkitRelativePath && fileWithPath.webkitRelativePath.includes('/')) {
            folders.push(file);
          } else if (file.size === 0 && !file.type && !file.name.includes('.')) {
            folders.push(file);
          } else {
            files.push(file);
          }
        });

        onFilesDropped(files, folders);
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
              <div className="hidden sm:block space-y-1">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
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

                {files.map((file, index) => (
                  <Fragment key={file.Key}>
                    <div onClick={() => handleFileClick(file)} className="cursor-pointer">
                      <FileItemList file={file} allFiles={files} _onAction={handleFileAction} />
                    </div>
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
