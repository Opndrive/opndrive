'use client';

import { ChevronRight, Home } from 'lucide-react';
import { useDriveStore } from '@/context/data-context';
import { Fragment } from 'react';

interface SearchBreadcrumbProps {
  prefix?: string | null;
  className?: string;
}

export function SearchBreadcrumb({ prefix, className = '' }: SearchBreadcrumbProps) {
  const { setCurrentPrefix } = useDriveStore();

  // Parse the prefix into segments
  const segments = prefix ? prefix.split('/').filter((segment) => segment.length > 0) : [];

  const handlePrefixChange = (index: number) => {
    // Build the prefix up to the clicked segment (inclusive)
    // All S3 prefixes should end with /
    const targetPrefix =
      index === -1
        ? '' // Root
        : segments.slice(0, index + 1).join('/') + '/';

    // Only update the store, don't navigate
    setCurrentPrefix(targetPrefix);
  };

  // Generate smart breadcrumbs for mobile (show last 2 with ellipsis if > 3)
  const mobileSegments =
    segments.length > 3
      ? [
          { segment: '...', index: -1, isEllipsis: true },
          { segment: segments[segments.length - 2], index: segments.length - 2, isEllipsis: false },
          { segment: segments[segments.length - 1], index: segments.length - 1, isEllipsis: false },
        ]
      : segments.map((segment, index) => ({ segment, index, isEllipsis: false }));

  const renderSegment = (segment: string, index: number, isLast: boolean, isEllipsis: boolean) => (
    <Fragment key={`${segment}-${index}`}>
      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/50 flex-shrink-0" />
      {isEllipsis ? (
        <span className="px-1.5 py-1 text-muted-foreground select-none text-xs sm:text-sm">
          {segment}
        </span>
      ) : (
        <button
          onClick={() => handlePrefixChange(index)}
          className={`px-1.5 sm:px-2 py-1 rounded-md hover:bg-secondary/80 transition-colors truncate text-xs sm:text-sm ${
            isLast
              ? 'text-foreground font-medium max-w-[80px] sm:max-w-[120px] md:max-w-[150px] lg:max-w-[200px]'
              : 'text-muted-foreground hover:text-foreground max-w-[60px] sm:max-w-[100px] md:max-w-[120px] lg:max-w-[150px]'
          }`}
          title={segment}
        >
          {segment}
        </button>
      )}
    </Fragment>
  );

  return (
    <nav className={`flex items-center min-w-0 ${className}`} aria-label="Breadcrumb">
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
        {/* Home / Root */}
        <button
          onClick={() => handlePrefixChange(-1)}
          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded-md hover:bg-secondary/80 transition-colors group flex-shrink-0"
          title="Set to root"
        >
          <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="text-muted-foreground group-hover:text-foreground transition-colors text-xs sm:text-sm hidden xs:inline">
            Home
          </span>
        </button>

        {/* Desktop - Show all segments (hidden on mobile) */}
        <div className="hidden sm:flex flex-wrap items-center">
          {segments.map((segment, index) =>
            renderSegment(segment, index, index === segments.length - 1, false)
          )}
        </div>

        {/* Mobile - Show smart truncation */}
        <div className="flex sm:hidden flex-wrap items-center">
          {mobileSegments.map((item) =>
            renderSegment(
              item.segment,
              item.index,
              item.index === segments.length - 1,
              item.isEllipsis
            )
          )}
        </div>

        {/* Show "Root" if no segments */}
        {segments.length === 0 && (
          <>
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/50 flex-shrink-0" />
            <span className="px-1.5 sm:px-2 py-1 text-foreground font-medium text-xs sm:text-sm">
              Root
            </span>
          </>
        )}
      </div>
    </nav>
  );
}
