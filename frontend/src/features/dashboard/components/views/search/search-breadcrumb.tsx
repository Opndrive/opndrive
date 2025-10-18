'use client';

import { ChevronRight, Home } from 'lucide-react';
import { useDriveStore } from '@/context/data-context';

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

  return (
    <nav className={`flex items-center gap-1 text-sm ${className}`} aria-label="Breadcrumb">
      {/* Home / Root */}
      <button
        onClick={() => handlePrefixChange(-1)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-secondary/80 transition-colors group"
        title="Set to root"
      >
        <Home className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          Home
        </span>
      </button>

      {/* Path Segments */}
      {segments.map((segment, index) => (
        <div key={`${segment}-${index}`} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
          <button
            onClick={() => handlePrefixChange(index)}
            className={`px-2 py-1 rounded-md hover:bg-secondary/80 transition-colors truncate max-w-[200px] ${
              index === segments.length - 1
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={segment}
          >
            {segment}
          </button>
        </div>
      ))}

      {/* Show "Root" if no segments */}
      {segments.length === 0 && (
        <div className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          <span className="px-2 py-1 text-foreground font-medium">Root</span>
        </div>
      )}
    </nav>
  );
}
