'use client';

import React from 'react';

interface FileSkeletonGridProps {
  className?: string;
}

export const FileSkeletonGrid: React.FC<FileSkeletonGridProps> = ({ className = '' }) => {
  return (
    <div
      className={`
        group relative rounded-lg bg-secondary/30 animate-pulse
        ${className}
      `}
    >
      <div className="w-full h-32 bg-muted/40 rounded-t-lg" />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-4 h-4 bg-muted/50 rounded flex-shrink-0" />
            <div className="h-4 bg-muted/50 rounded flex-1" />
          </div>

          <div className="w-4 h-4 bg-muted/30 rounded-full flex-shrink-0" />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-muted/40 rounded-full" />
                <div className="h-3 bg-muted/40 rounded w-8" />
              </div>
            </div>
            <div className="h-3 bg-muted/30 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
};

interface FileSkeletonListProps {
  className?: string;
}

export const FileSkeletonList: React.FC<FileSkeletonListProps> = ({ className = '' }) => {
  return (
    <div
      className={`
        group flex items-center gap-4 px-4 py-3 
        bg-secondary/30 animate-pulse border-b border-border/30
        ${className}
      `}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 bg-muted/40 rounded-md flex-shrink-0" />
        <div className="min-w-0">
          <div className="h-4 bg-muted/40 rounded w-32 mb-1" />
          <div className="h-3 bg-muted/40 rounded w-20" />
        </div>
      </div>

      <div className="hidden md:block col-span-3">
        <div className="h-4 bg-muted/40 rounded w-24" />
      </div>

      <div className="hidden lg:flex items-center gap-2 col-span-2">
        <div className="w-6 h-6 bg-muted/40 rounded-full" />
        <div className="h-4 bg-muted/40 rounded w-12" />
      </div>

      <div className="hidden xl:flex items-center gap-2 col-span-2">
        <div className="w-4 h-4 bg-muted/40 rounded" />
        <div className="h-4 bg-muted/40 rounded w-20" />
      </div>

      <div className="col-span-1 flex justify-end">
        <div className="w-4 h-4 bg-muted/30 rounded-full" />
      </div>
    </div>
  );
};

interface FileSkeletonGridListProps {
  count?: number;
  layout?: 'grid' | 'list';
  className?: string;
}

export const FileSkeletonGridList: React.FC<FileSkeletonGridListProps> = ({
  count = 8,
  layout = 'grid',
  className = '',
}) => {
  if (layout === 'grid') {
    return (
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 ${className}`}
      >
        {Array.from({ length: count }).map((_, index) => (
          <FileSkeletonGrid key={`file-skeleton-grid-${index}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border/30">
        <div className="col-span-4 h-3 bg-muted/30 rounded w-16" />
        <div className="hidden md:block col-span-3 h-3 bg-muted/30 rounded w-20" />
        <div className="hidden lg:block col-span-2 h-3 bg-muted/30 rounded w-12" />
        <div className="hidden xl:block col-span-2 h-3 bg-muted/30 rounded w-16" />
        <div className="col-span-1" />
      </div>

      {Array.from({ length: count }).map((_, index) => (
        <div key={`file-skeleton-list-${index}`} className="grid grid-cols-12 gap-4">
          <FileSkeletonList />
        </div>
      ))}
    </div>
  );
};
