'use client';

import { useRouter } from 'next/navigation';
import { Breadcrumb, type BreadcrumbItem } from '@/shared/components/ui/breadcrumb';

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

  // The root is a crumb like any other, which is what keeps it pinned to the
  // left when the middle of the trail collapses.
  const items: BreadcrumbItem[] = [
    { name: 'My Drive', onSelect: () => handleNavigation([]) },
    ...pathSegments.map((segment, index) => ({
      name: segment,
      onSelect: () => handleNavigation(pathSegments.slice(0, index + 1)),
    })),
  ];

  return (
    <div className="flex items-center border-b border-border/50 py-4">
      <Breadcrumb items={items} className="flex-1" />
    </div>
  );
}
