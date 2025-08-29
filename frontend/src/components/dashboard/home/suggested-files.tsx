'use client';

import { useState } from 'react';
import type { FileItem, ViewLayout } from '@/types/dashboard/file';
import { LayoutToggle } from '@/components/ui/layout-toggle';
import { FileItemGrid } from '@/components/ui/dashboard/file-item-grid';
import { FileItemList } from '@/components/ui/dashboard/file-item-list';

interface SuggestedFilesProps {
  files: FileItem[];
  onFileClick?: (file: FileItem) => void;
  onFileAction?: (action: string, file: FileItem) => void;
  className?: string;
}

export function SuggestedFiles({
  files,
  onFileClick,
  onFileAction,
  className = '',
}: SuggestedFilesProps) {
  const [layout, setLayout] = useState<ViewLayout>('list');
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
        <p className="text-muted-foreground">No suggested files available.</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <button
          className="
            flex items-center gap-2 p-2
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

        {isExpanded && <LayoutToggle layout={layout} onLayoutChange={setLayout} />}
      </div>

      {isExpanded && (
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
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                <div className="col-span-4">Name</div>
                <div className="hidden md:block col-span-3">Last Updates</div>
                <div className="hidden lg:block col-span-2">Owner</div>
                <div className="hidden xl:block col-span-2">Location</div>
                <div className="col-span-1"></div>
              </div>
              {files.map((file) => (
                <div
                  key={file.Key}
                  onClick={() => handleFileClick(file)}
                  className="cursor-pointer"
                >
                  <FileItemList file={file} _onAction={handleFileAction} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
