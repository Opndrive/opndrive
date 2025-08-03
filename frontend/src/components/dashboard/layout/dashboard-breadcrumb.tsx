'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { Fragment } from 'react';

interface DashboardBreadcrumbProps {
  role: string; // 'admin' or 'sevadar'
}

export function DashboardBreadcrumb({ role }: DashboardBreadcrumbProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/${role}`;

  // Ensure we are on a path relevant to the current role's dashboard
  if (!pathname.startsWith(basePath)) {
    return null;
  }

  const relativePath = pathname.substring(basePath.length);
  const pathSegments = relativePath.split('/').filter(Boolean);

  const breadcrumbsData = [
    {
      name: role.charAt(0).toUpperCase() + role.slice(1),
      href: basePath,
      current: pathSegments.length === 0,
    },
  ];

  let currentBuiltPath = basePath;
  pathSegments.forEach((segment, index) => {
    currentBuiltPath += `/${segment}`;
    breadcrumbsData.push({
      name: segment
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' '), // Capitalize and join hyphenated segments
      href: currentBuiltPath,
      current: index === pathSegments.length - 1,
    });
  });

  // If only the base role breadcrumb exists, and it's not the current page (meaning we are on the base page itself)
  // we don't need to show "Admin > Admin" for example.
  // The 'current' flag handles this. The Home icon will link to the base path.

  return (
    <nav className="px-6 py-3  border-border hidden md:block">
      <div className="overflow-x-auto">
        <div className="flex items-center text-sm bg-secondary p-2 rounded-2xl whitespace-nowrap">
          <div className="flex items-center">
            <Link href={basePath} className="text-muted-foreground hover:text-foreground">
              <Home size={16} />
              <span className="sr-only">{role.charAt(0).toUpperCase() + role.slice(1)} Home</span>
            </Link>
          </div>

          {breadcrumbsData.map((breadcrumb, _index) => (
            <Fragment key={breadcrumb.href}>
              <ChevronRight size={16} className="mx-2 text-muted-foreground" />
              <Link
                href={breadcrumb.href}
                className={
                  breadcrumb.current
                    ? 'text-foreground font-medium truncate max-w-[150px]' // Added truncate for long names
                    : 'text-muted-foreground hover:text-foreground truncate max-w-[150px]'
                }
                aria-current={breadcrumb.current ? 'page' : undefined}
              >
                {breadcrumb.name}
              </Link>
            </Fragment>
          ))}
        </div>
      </div>
    </nav>
  );
}
