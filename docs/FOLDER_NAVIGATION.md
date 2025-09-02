# Folder Navigation System

This document explains how OpnDrive's folder navigation system works, including
the S3-based architecture, dynamic routing, and breadcrumb generation.

## Architecture Overview

OpnDrive uses a **prefix-based navigation system** built on top of Amazon S3,
where folders are represented as object prefixes rather than traditional
directory structures.

### Key Concepts

1. **S3 Prefixes** - Folders are simulated using object key prefixes
2. **Dynamic Routing** - Next.js catch-all routes handle folder navigation
3. **Breadcrumb Generation** - Automatic breadcrumb creation from URL paths
4. **State Management** - URL-driven navigation state

## 📁 S3 Folder Structure

### How S3 "Folders" Work

```
S3 Bucket Structure:
my-bucket/
├── documents/              # Prefix: "documents/"
│   ├── reports/           # Prefix: "documents/reports/"
│   │   └── annual.pdf     # Key: "documents/reports/annual.pdf"
│   └── contracts/         # Prefix: "documents/contracts/"
│       └── client-a.pdf   # Key: "documents/contracts/client-a.pdf"
├── images/                # Prefix: "images/"
│   ├── photos/           # Prefix: "images/photos/"
│   └── logos/            # Prefix: "images/logos/"
└── videos/                # Prefix: "videos/"
```

### Prefix to URL Mapping

```typescript
// S3 Prefix → OpnDrive URL
"" → "/dashboard"                           // Root
"documents/" → "/dashboard/documents"       // Top-level folder
"documents/reports/" → "/dashboard/documents/reports"  // Nested folder
```

## Dynamic Routing Implementation

### Next.js Route Structure

```
app/dashboard/
├── page.tsx              # /dashboard (root)
└── [...path]/
    └── page.tsx          # /dashboard/any/nested/path
```

### Route Handler Implementation

```typescript
// app/dashboard/[...path]/page.tsx
interface PageProps {
  params: {
    path?: string[]  // ['documents', 'reports'] for /dashboard/documents/reports
  }
  searchParams: {
    view?: 'grid' | 'list'
    sort?: 'name' | 'date' | 'size'
  }
}

export default function FolderPage({ params, searchParams }: PageProps) {
  const path = params.path || []
  const prefix = path.length > 0 ? path.join('/') + '/' : ''

  return <FolderView prefix={prefix} view={searchParams.view} />
}
```

### Path Processing

```typescript
// lib/folder-navigation.ts
export function getS3Prefix(pathSegments: string[]): string {
  if (pathSegments.length === 0) return '';
  return pathSegments.join('/') + '/';
}

export function getParentPrefix(currentPrefix: string): string {
  if (!currentPrefix || currentPrefix === '') return '';

  const segments = currentPrefix.split('/').filter(Boolean);
  if (segments.length <= 1) return '';

  return segments.slice(0, -1).join('/') + '/';
}

export function getFolderName(prefix: string): string {
  const segments = prefix.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'My Drive';
}
```

## 🧭 Breadcrumb System

### Breadcrumb Generation

```typescript
// components/layout/breadcrumb/folder-breadcrumb.tsx
interface BreadcrumbItem {
  label: string;
  href: string;
  isActive: boolean;
}

export function generateBreadcrumbs(pathSegments: string[]): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: 'My Drive',
      href: '/dashboard',
      isActive: pathSegments.length === 0,
    },
  ];

  pathSegments.forEach((segment, index) => {
    const href = `/dashboard/${pathSegments.slice(0, index + 1).join('/')}`;
    breadcrumbs.push({
      label: decodeURIComponent(segment),
      href,
      isActive: index === pathSegments.length - 1,
    });
  });

  return breadcrumbs;
}
```

### Breadcrumb Component

```typescript
export function FolderBreadcrumb({ path }: { path: string[] }) {
  const breadcrumbs = generateBreadcrumbs(path)

  return (
    <nav aria-label="Folder navigation" className="breadcrumb">
      <ol className="flex items-center space-x-2">
        {breadcrumbs.map((crumb, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && <ChevronRight className="w-4 h-4 mx-2" />}
            {crumb.isActive ? (
              <span className="text-foreground font-medium">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
```

## Navigation State Management

### URL as Single Source of Truth

```typescript
// hooks/use-folder-navigation.ts
export function useFolderNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPath = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments.slice(2); // Remove 'dashboard' from path
  }, [pathname]);

  const currentPrefix = useMemo(() => {
    return getS3Prefix(currentPath);
  }, [currentPath]);

  const navigateToFolder = useCallback(
    (folderName: string) => {
      const newPath = [...currentPath, encodeURIComponent(folderName)];
      router.push(`/dashboard/${newPath.join('/')}`);
    },
    [currentPath, router]
  );

  const navigateUp = useCallback(() => {
    if (currentPath.length === 0) return;

    const parentPath = currentPath.slice(0, -1);
    const href =
      parentPath.length > 0
        ? `/dashboard/${parentPath.join('/')}`
        : '/dashboard';

    router.push(href);
  }, [currentPath, router]);

  const navigateToPath = useCallback(
    (pathSegments: string[]) => {
      const href =
        pathSegments.length > 0
          ? `/dashboard/${pathSegments.join('/')}`
          : '/dashboard';

      router.push(href);
    },
    [router]
  );

  return {
    currentPath,
    currentPrefix,
    navigateToFolder,
    navigateUp,
    navigateToPath,
  };
}
```

### Search Params Integration

```typescript
// Handle view mode, sorting, etc. through URL search params
export function useFolderView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const viewMode = (searchParams.get('view') as 'grid' | 'list') || 'grid';
  const sortBy =
    (searchParams.get('sort') as 'name' | 'date' | 'size') || 'name';
  const sortOrder = (searchParams.get('order') as 'asc' | 'desc') || 'asc';

  const updateView = useCallback(
    (newView: 'grid' | 'list') => {
      const params = new URLSearchParams(searchParams);
      params.set('view', newView);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const updateSort = useCallback(
    (sortBy: string, order: 'asc' | 'desc') => {
      const params = new URLSearchParams(searchParams);
      params.set('sort', sortBy);
      params.set('order', order);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  return {
    viewMode,
    sortBy,
    sortOrder,
    updateView,
    updateSort,
  };
}
```

## Data Fetching Strategy

### S3 List Objects Implementation

```typescript
// lib/s3-client.ts
export async function listFolderContents(prefix: string = '') {
  const command = new ListObjectsV2Command({
    Bucket: process.env.S3_BUCKET_NAME,
    Prefix: prefix,
    Delimiter: '/', // This creates "folder" behavior
    MaxKeys: 1000,
  });

  const response = await s3Client.send(command);

  // Folders (CommonPrefixes)
  const folders =
    response.CommonPrefixes?.map((prefix) => ({
      name: prefix.Prefix?.replace(prefix, '').replace('/', '') || '',
      prefix: prefix.Prefix || '',
      type: 'folder' as const,
    })) || [];

  // Files (Contents)
  const files =
    response.Contents?.filter(
      (object) => object.Key !== prefix && object.Key?.endsWith('/') === false
    ).map((object) => ({
      key: object.Key || '',
      name: object.Key?.split('/').pop() || '',
      size: object.Size || 0,
      lastModified: object.LastModified,
      type: 'file' as const,
    })) || [];

  return { folders, files, hasMore: response.IsTruncated || false };
}
```

### React Query Integration

```typescript
// hooks/use-folder-data.ts
export function useFolderData(prefix: string) {
  return useQuery({
    queryKey: ['folder-contents', prefix],
    queryFn: () => listFolderContents(prefix),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}

export function useFolderHierarchy(prefix: string) {
  return useQuery({
    queryKey: ['folder-hierarchy', prefix],
    queryFn: async () => {
      const segments = prefix.split('/').filter(Boolean);
      const hierarchyPromises = segments.map((_, index) => {
        const parentPrefix = segments.slice(0, index + 1).join('/') + '/';
        return listFolderContents(parentPrefix);
      });

      return await Promise.all(hierarchyPromises);
    },
    enabled: prefix.length > 0,
  });
}
```

## 🔍 Search and Filtering

### Search Implementation

```typescript
// Search across folder hierarchy
export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ['global-search', query],
    queryFn: async () => {
      if (!query.trim()) return { files: [], folders: [] };

      // Search all objects with query in the key
      const command = new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET_NAME,
        MaxKeys: 100,
      });

      const response = await s3Client.send(command);
      const allObjects = response.Contents || [];

      // Filter results based on query
      const matchingFiles = allObjects.filter((obj) =>
        obj.Key?.toLowerCase().includes(query.toLowerCase())
      );

      return processSearchResults(matchingFiles);
    },
    enabled: query.length >= 2,
  });
}
```

### Folder-specific Filtering

```typescript
export function useFilteredFolderContents(
  prefix: string,
  filters: { search?: string; type?: 'files' | 'folders' | 'all' }
) {
  const { data: rawData } = useFolderData(prefix);

  return useMemo(() => {
    if (!rawData) return { files: [], folders: [] };

    let { files, folders } = rawData;

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      files = files.filter((file) =>
        file.name.toLowerCase().includes(searchLower)
      );
      folders = folders.filter((folder) =>
        folder.name.toLowerCase().includes(searchLower)
      );
    }

    // Apply type filter
    if (filters.type === 'files') {
      folders = [];
    } else if (filters.type === 'folders') {
      files = [];
    }

    return { files, folders };
  }, [rawData, filters]);
}
```

## Performance Optimizations

### Prefetching

```typescript
// Prefetch commonly accessed folders
export function useFolderPrefetch() {
  const queryClient = useQueryClient()

  const prefetchFolder = useCallback((prefix: string) => {
    queryClient.prefetchQuery({
      queryKey: ['folder-contents', prefix],
      queryFn: () => listFolderContents(prefix),
      staleTime: 60000 // 1 minute
    })
  }, [queryClient])

  return { prefetchFolder }
}

// Usage in folder components
export function FolderItem({ folder }: { folder: FolderItem }) {
  const { prefetchFolder } = useFolderPrefetch()

  return (
    <div
      onMouseEnter={() => prefetchFolder(folder.prefix)}
      onClick={() => navigateToFolder(folder.name)}
    >
      {folder.name}
    </div>
  )
}
```

### Virtual Scrolling for Large Folders

```typescript
// For folders with many items
export function VirtualizedFileGrid({ files }: { files: FileItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated item height
    overscan: 5
  })

  return (
    <div ref={parentRef} className="file-grid-container">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <FileItem file={files[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## 🔐 Security Considerations

### Path Validation

```typescript
// Validate and sanitize path segments
export function validatePath(pathSegments: string[]): boolean {
  return pathSegments.every((segment) => {
    // Check for directory traversal attempts
    if (segment.includes('..') || segment.includes('//')) {
      return false;
    }

    // Check for invalid characters
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(segment)) {
      return false;
    }

    // Check length
    if (segment.length === 0 || segment.length > 255) {
      return false;
    }

    return true;
  });
}
```

### Access Control

```typescript
// Check if user has access to specific folder
export async function checkFolderAccess(
  userId: string,
  prefix: string
): Promise<boolean> {
  // Implementation depends on your access control system
  // This could check:
  // - User ownership
  // - Shared folder permissions
  // - Organization access rules

  return await hasUserAccessToPrefix(userId, prefix);
}
```

## Mobile Optimization

### Touch-friendly Navigation

```typescript
export function MobileFolderNavigation() {
  const { currentPath, navigateUp } = useFolderNavigation()

  return (
    <div className="mobile-nav">
      {/* Swipe gestures for navigation */}
      <SwipeableArea
        onSwipeRight={navigateUp}
        className="swipe-area"
      >
        <FolderBreadcrumb path={currentPath} />
      </SwipeableArea>

      {/* Pull-to-refresh */}
      <PullToRefresh onRefresh={refetchFolderContents}>
        <FolderContents />
      </PullToRefresh>
    </div>
  )
}
```

### Responsive Breadcrumbs

```typescript
export function ResponsiveBreadcrumb({ path }: { path: string[] }) {
  const [showFullPath, setShowFullPath] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

  if (isMobile && path.length > 2 && !showFullPath) {
    return (
      <div className="breadcrumb-compact">
        <Link href="/dashboard">My Drive</Link>
        <span>...</span>
        <button onClick={() => setShowFullPath(true)}>
          <EllipsisIcon />
        </button>
        <span>{path[path.length - 1]}</span>
      </div>
    )
  }

  return <FullBreadcrumb path={path} />
}
```

## Testing Navigation

### Unit Tests

```typescript
// folder-navigation.test.ts
describe('Folder Navigation Utils', () => {
  test('getS3Prefix generates correct prefix', () => {
    expect(getS3Prefix([])).toBe('');
    expect(getS3Prefix(['documents'])).toBe('documents/');
    expect(getS3Prefix(['documents', 'reports'])).toBe('documents/reports/');
  });

  test('generateBreadcrumbs creates correct breadcrumb structure', () => {
    const breadcrumbs = generateBreadcrumbs(['documents', 'reports']);

    expect(breadcrumbs).toHaveLength(3);
    expect(breadcrumbs[0].label).toBe('My Drive');
    expect(breadcrumbs[1].label).toBe('documents');
    expect(breadcrumbs[2].label).toBe('reports');
    expect(breadcrumbs[2].isActive).toBe(true);
  });
});
```

### Integration Tests

```typescript
// navigation.integration.test.tsx
describe('Folder Navigation Integration', () => {
  test('navigating to folder updates URL and renders content', async () => {
    render(<DashboardApp />)

    // Click on a folder
    const folderLink = screen.getByText('Documents')
    fireEvent.click(folderLink)

    // Check URL changed
    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard/documents')
    })

    // Check breadcrumb updated
    expect(screen.getByText('Documents')).toBeInTheDocument()
  })
})
```

---

_This navigation system provides a scalable, performant way to browse S3-based
folder structures while maintaining a native file explorer experience._
