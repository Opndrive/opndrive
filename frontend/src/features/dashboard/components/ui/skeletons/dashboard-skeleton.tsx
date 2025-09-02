'use client';

import React from 'react';
import { FolderSkeletonList } from './folder-skeleton';
import { FileSkeletonGridList } from './file-skeleton';
import type { ViewLayout } from '@/features/dashboard/types/file';

interface SuggestedSectionSkeletonProps {
  title: string;
  type: 'folders' | 'files';
  layout?: ViewLayout;
  count?: number;
  isExpanded?: boolean;
  className?: string;
}

export const SuggestedSectionSkeleton: React.FC<SuggestedSectionSkeletonProps> = ({
  type,
  layout = 'grid',
  count = 6,
  isExpanded = true,
  className = '',
}) => {
  return (
    <div className={`w-full ${className}`}>
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 p-2">
          {/* Arrow Icon */}
          <div className="w-4 h-4 bg-muted/40 rounded animate-pulse" />
          {/* Title */}
          <div className="h-4 bg-muted/50 rounded w-32 animate-pulse" />
        </div>

        {/* Layout Toggle Skeleton (only for files) */}
        {type === 'files' && isExpanded && (
          <div className="flex rounded-lg bg-secondary/30 p-1 animate-pulse">
            <div className="w-8 h-8 bg-muted/40 rounded-md" />
            <div className="w-8 h-8 bg-muted/40 rounded-md ml-1" />
          </div>
        )}
      </div>

      {/* Content Skeleton */}
      {isExpanded && (
        <div>
          {type === 'folders' ? (
            <FolderSkeletonList count={count} />
          ) : (
            <FileSkeletonGridList count={count} layout={layout} />
          )}
        </div>
      )}
    </div>
  );
};

interface DashboardLoadingProps {
  showFolders?: boolean;
  showFiles?: boolean;
  fileLayout?: ViewLayout;
  className?: string;
}

export const DashboardLoading: React.FC<DashboardLoadingProps> = ({
  showFolders = true,
  showFiles = true,
  fileLayout = 'grid',
  className = '',
}) => {
  return (
    <div className={`space-y-8 ${className}`}>
      {/* Suggested Folders Loading */}
      {showFolders && (
        <SuggestedSectionSkeleton title="Suggested folders" type="folders" count={6} />
      )}

      {/* Suggested Files Loading */}
      {showFiles && (
        <SuggestedSectionSkeleton
          title="Suggested files"
          type="files"
          layout={fileLayout}
          count={8}
        />
      )}
    </div>
  );
};
