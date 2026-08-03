'use client';

import { Home } from 'lucide-react';
import { useDriveStore } from '@/context/data-context';
import { Breadcrumb, type BreadcrumbItem } from '@/shared/components/ui/breadcrumb';

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

  const items: BreadcrumbItem[] = [
    {
      name: 'Home',
      icon: <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
      onSelect: () => handlePrefixChange(-1),
    },
    ...segments.map((segment, index) => ({
      name: segment,
      onSelect: () => handlePrefixChange(index),
    })),
  ];

  return <Breadcrumb items={items} className={className} />;
}
