'use client';

import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateSmartBreadcrumbs,
  type BreadcrumbItem,
} from '@/features/folder-navigation/folder-navigation';

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

  const { mobile, desktop } = generateSmartBreadcrumbs(pathSegments);

  const renderBreadcrumbItem = (item: BreadcrumbItem, showChevron: boolean = true) => {
    const isClickable = !item.isEllipsis;

    return (
      <Fragment key={`${item.index}-${item.segment}`}>
        {showChevron && (
          <ChevronRight size={14} className="mx-0.5 text-muted-foreground flex-shrink-0" />
        )}
        {item.isEllipsis ? (
          <span className="px-1.5 py-1 text-muted-foreground select-none">{item.segment}</span>
        ) : (
          <button
            className={`px-1.5 py-1 rounded-md transition-colors truncate ${
              item.isLast
                ? 'text-foreground font-medium bg-secondary/30 max-w-[100px] sm:max-w-[150px] md:max-w-[200px]'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 max-w-[80px] sm:max-w-[120px] md:max-w-[180px]'
            } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            onClick={() => isClickable && handleNavigation(item.pathUpToHere)}
            title={item.segment}
            disabled={!isClickable}
          >
            {item.segment}
          </button>
        )}
      </Fragment>
    );
  };

  return (
    <div className="flex items-center py-4 border-b border-border/50">
      <nav className="flex items-center min-w-0 flex-1">
        <div className="flex items-center text-sm overflow-x-auto scrollbar-hide">
          {/* My Drive link */}
          <button
            onClick={() => handleNavigation([])}
            className="text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-secondary/50 transition-colors flex-shrink-0"
          >
            <span className="hidden sm:inline">My Drive</span>
            <span className="sm:hidden">Drive</span>
          </button>

          {/* Desktop breadcrumbs - hidden on mobile (md and above) */}
          <div className="hidden md:flex items-center">
            {desktop.map((item) => renderBreadcrumbItem(item, true))}
          </div>

          {/* Mobile breadcrumbs - shown on small and medium screens */}
          <div className="flex md:hidden items-center">
            {mobile.map((item) => renderBreadcrumbItem(item, true))}
          </div>
        </div>
      </nav>
    </div>
  );
}
