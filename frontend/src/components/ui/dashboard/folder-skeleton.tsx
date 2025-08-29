'use client';

import React from 'react';

interface FolderSkeletonProps {
  className?: string;
}

export const FolderSkeleton: React.FC<FolderSkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`
        group flex items-center gap-3 p-3 rounded-lg
        bg-secondary/30 animate-pulse
        ${className}
      `}
    >
      {/* Folder Icon Skeleton */}
      <div className="flex-shrink-0">
        <div className="w-5 h-5 bg-muted/50 rounded" />
      </div>

      {/* Folder Content Skeleton */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Folder Name */}
        <div className="h-4 bg-muted/50 rounded w-3/4" />
        {/* Location */}
        <div className="h-3 bg-muted/30 rounded w-1/2" />
      </div>

      {/* Menu Button Skeleton */}
      <div className="flex-shrink-0">
        <div className="w-4 h-4 bg-muted/30 rounded-full" />
      </div>
    </div>
  );
};

interface FolderSkeletonListProps {
  count?: number;
  className?: string;
}

export const FolderSkeletonList: React.FC<FolderSkeletonListProps> = ({
  count = 6,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <FolderSkeleton key={`folder-skeleton-${index}`} />
      ))}
    </div>
  );
};
