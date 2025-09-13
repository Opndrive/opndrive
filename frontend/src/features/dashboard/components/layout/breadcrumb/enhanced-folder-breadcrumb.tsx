'use client';

import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { useRouter } from 'next/navigation';

interface EnhancedFolderBreadcrumbProps {
  pathSegments: string[];
  currentKey?: string;
  onNavigate?: (prefix: string, key?: string) => void;
}

export function EnhancedFolderBreadcrumb({
  pathSegments,
  currentKey,
  onNavigate,
}: EnhancedFolderBreadcrumbProps) {
  const router = useRouter();

  const handleNavigation = (segments: string[]) => {
    const newPrefix = segments.length > 0 ? segments.join('/') + '/' : '';
    const newKey = segments.length > 0 ? segments[segments.length - 1] : undefined;

    if (onNavigate) {
      onNavigate(newPrefix, newKey);
    } else {
      // Default navigation behavior
      const params = new URLSearchParams();
      if (newPrefix) {
        params.set('prefix', newPrefix);
      }
      if (newKey && currentKey) {
        params.set('key', newKey);
      }

      const url =
        newPrefix || (newKey && currentKey)
          ? `/dashboard/browse?${params.toString()}`
          : '/dashboard';
      router.push(url);
    }
  };

  return (
    <div className="flex items-center py-4 border-b border-border/50">
      <nav className="flex items-center min-w-0 flex-1">
        <div className="flex items-center text-sm overflow-x-auto">
          {/* My Drive link */}
          <button
            onClick={() => handleNavigation([])}
            className="text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary/50 transition-colors"
          >
            <span className="hidden sm:inline">My Drive</span>
          </button>

          {/* Breadcrumb items */}
          {pathSegments.map((segment, index) => {
            const isLast = index === pathSegments.length - 1;
            const pathUpToHere = pathSegments.slice(0, index + 1);

            return (
              <Fragment key={index}>
                <ChevronRight size={16} className="mx-1 text-muted-foreground flex-shrink-0" />
                <button
                  className={`px-2 py-1 cursor-pointer rounded-md transition-colors truncate max-w-[200px] ${
                    isLast
                      ? 'text-foreground font-medium bg-secondary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                  onClick={() => handleNavigation(pathUpToHere)}
                  title={segment}
                >
                  {segment}
                </button>
              </Fragment>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
