'use client';

import { ViewDetails } from '@/features/dashboard/components/ui/details/view-details';
import { useDriveStore } from '@/context/data-context';
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { useRouter } from 'next/navigation';

interface FolderBreadcrumbProps {
  pathSegments: string[];
}

export function FolderBreadcrumb({ pathSegments }: FolderBreadcrumbProps) {
  const { setCurrentPrefix: _setCurrentPrefix } = useDriveStore();
  const router = useRouter();

  return (
    <div className="flex items-center justify-between py-4 border-b border-border/50">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center min-w-0 flex-1">
        <div className="flex items-center text-sm overflow-x-auto">
          {/* My Drive link */}
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary/50 transition-colors"
          >
            <Home size={16} />
          </Link>

          {/* Breadcrumb items */}
          {pathSegments.map((segment, index) => {
            const isLast = index === pathSegments.length - 1;
            const pathUpToHere = pathSegments.slice(0, index + 1).join('/');

            return (
              <Fragment key={index}>
                <ChevronRight size={16} className="mx-1 text-muted-foreground flex-shrink-0" />
                <button
                  className={`px-2 py-1 rounded-md transition-colors truncate max-w-[200px] ${
                    isLast
                      ? 'text-foreground font-medium bg-secondary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                  onClick={() => {
                    // Use the new browse route with query parameters
                    const params = new URLSearchParams();
                    params.set('prefix', pathUpToHere + '/');
                    if (pathUpToHere.length > 0) {
                      params.set('key', pathSegments[index]);
                    }
                    router.push(`/dashboard/browse?${params.toString()}`);
                  }}
                >
                  {segment}
                </button>
              </Fragment>
            );
          })}
        </div>
      </nav>

      {/* View Details - Only show once on the right */}
      <div className="flex-shrink-0 ml-4">
        <ViewDetails />
      </div>
    </div>
  );
}
