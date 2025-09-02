# Frontend Architecture

This document explains the frontend architecture of OpnDrive, including design
patterns, component organization, and development workflows.

## Architecture Overview

OpnDrive's frontend is built with **Next.js 14** using the App Router, following
enterprise-grade patterns inspired by applications like Google Drive, Dropbox,
and Notion.

### Core Principles

1. **Feature-Based Architecture** - Organize code by business features, not
   technical layers
2. **Component Composition** - Build complex UIs from simple, reusable
   components
3. **Type Safety First** - Comprehensive TypeScript coverage with strict typing
4. **Performance Optimized** - Code splitting, lazy loading, and efficient
   re-renders
5. **Accessibility Ready** - WCAG compliant components and keyboard navigation

## Enterprise Patterns

### 1. Feature-Based Organization

Instead of organizing by technical layers (components, hooks, utils), we
organize by business features:

```
❌ Technical Layer Organization:
src/
├── components/
├── hooks/
├── utils/
└── types/

✅ Feature-Based Organization:
src/
├── features/
│   ├── dashboard/
│   ├── file-management/
│   └── user-profile/
├── shared/
└── app/
```

### 2. Component Architecture Layers

```
┌─────────────────────────────────────┐
│             App Pages               │ ← Next.js App Router pages
├─────────────────────────────────────┤
│          Feature Views              │ ← Business logic containers
├─────────────────────────────────────┤
│        Feature Components           │ ← Feature-specific components
├─────────────────────────────────────┤
│         Shared Components           │ ← Reusable UI primitives
└─────────────────────────────────────┘
```

## Component Organization

### Dashboard Feature Structure

```
features/dashboard/components/
├── layout/                    # Layout Infrastructure
│   ├── navbar/               # Top navigation bar
│   │   ├── dashboard-navbar.tsx
│   │   ├── navbar-search.tsx
│   │   └── navbar-profile.tsx
│   ├── sidebar/              # Side navigation
│   │   ├── dashboard-sidebar.tsx
│   │   ├── sidebar-nav-item.tsx
│   │   └── sidebar-create-button.tsx
│   └── breadcrumb/           # Navigation breadcrumbs
│       ├── folder-breadcrumb.tsx
│       └── enhanced-folder-breadcrumb.tsx
├── ui/                       # Business UI Components
│   ├── items/               # File/Folder display components
│   │   ├── file-item-grid.tsx    # Grid view for files
│   │   ├── file-item-list.tsx    # List view for files
│   │   ├── file-thumbnail.tsx    # File preview thumbnails
│   │   └── folder-item.tsx       # Folder display component
│   ├── menus/               # Context menus and actions
│   │   ├── file-overflow-menu.tsx
│   │   ├── overflow-menu.tsx
│   │   └── create-menu.tsx
│   ├── details/             # Information panels
│   │   ├── details-sidebar.tsx
│   │   └── view-details.tsx
│   └── skeletons/           # Loading states
│       ├── dashboard-skeleton.tsx
│       ├── file-skeleton.tsx
│       └── folder-skeleton.tsx
└── views/                   # Page-Level Views
    ├── home/               # Dashboard home view
    │   ├── drive-hero.tsx      # Hero section with search
    │   ├── suggested-files.tsx  # File recommendations
    │   └── suggested-folders.tsx # Folder recommendations
    └── search/             # Search interface
        ├── search-bar.tsx
        ├── filter-bar.tsx
        └── search-results.tsx
```

### Component Hierarchy Philosophy

**Layout Components** (`layout/`)

- Handle page structure and navigation
- Manage global state and user interactions
- Provide consistent user experience across pages

**UI Components** (`ui/`)

- Encapsulate specific business logic
- Handle data display and user interactions
- Reusable within the same feature

**View Components** (`views/`)

- Compose multiple components into full page views
- Handle page-level state management
- Connect to data sources and APIs

## Technical Implementation

### State Management Strategy

```typescript
// 1. Server State (React Query/SWR)
const { data: files } = useFiles(folderId);

// 2. URL State (Next.js Router)
const searchParams = useSearchParams();

// 3. Local State (React hooks)
const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

// 4. Global State (React Context)
const { theme, setTheme } = useTheme();
```

### Component Patterns

#### 1. Compound Components

```typescript
// Dashboard composition
<Dashboard>
  <Dashboard.Navbar />
  <Dashboard.Sidebar />
  <Dashboard.Content>
    <Dashboard.FileGrid files={files} />
  </Dashboard.Content>
</Dashboard>
```

#### 2. Render Props & Children Functions

```typescript
<FileList>
  {({ files, loading }) => (
    loading ? <FileSkeleton /> : <FileItems files={files} />
  )}
</FileList>
```

#### 3. Hook-based Logic

```typescript
// Custom hooks for complex logic
function useFileOperations() {
  const uploadFile = useCallback(...)
  const deleteFile = useCallback(...)
  const shareFile = useCallback(...)

  return { uploadFile, deleteFile, shareFile }
}
```

### Type System Architecture

```typescript
// Base types from S3 SDK
import { _Object, CommonPrefix } from '@aws-sdk/client-s3';

// Extended domain types
export interface FileItem extends _Object {
  id: string;
  name: string;
  extension: string;
  size: { value: number; unit: DataUnits };
  // ... other properties
}

// Component prop types
export interface FileItemGridProps {
  file: FileItem;
  onAction?: (action: string, file: FileItem) => void;
  className?: string;
}
```

## Navigation & Routing

### App Router Structure

OpnDrive uses Next.js App Router with static routes:

```
app/
├── dashboard/
│   ├── page.tsx                    # Dashboard home
│   ├── layout.tsx                  # Dashboard layout
│   └── browse/
│       └── page.tsx               # File browsing interface
```

This handles routes like:

- `/dashboard` → Dashboard home page
- `/dashboard/browse` → File and folder browsing interface

### S3 Integration Pattern

```typescript
// URL query parameters → S3 Prefix mapping
const getS3Prefix = (path?: string) => {
  return path ? `${path}/` : '';
};

// /dashboard/browse?path=folder/subfolder → "folder/subfolder/"
```

### Breadcrumb Generation

```typescript
function generateBreadcrumbs(path?: string) {
  if (!path) return [];

  const segments = path.split('/');
  return segments.map((segment, index) => ({
    label: segment,
    href: `/dashboard/browse?path=${segments.slice(0, index + 1).join('/')}`,
    isActive: index === segments.length - 1,
  }));
}
```

## Styling Architecture

### Design System Layers

```
1. Design Tokens (Tailwind CSS variables)
   ↓
2. Component Primitives (shadcn/ui)
   ↓
3. Feature Components (business-specific styling)
   ↓
4. Page Layouts (composition and spacing)
```

### Theme System

```typescript
// CSS Custom Properties
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  // ... other tokens
}

[data-theme="dark"] {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  // ... dark mode overrides
}
```

### Component Styling Patterns

```typescript
// 1. Tailwind utility classes
<div className="flex items-center gap-2 p-4 rounded-lg border">

// 2. CSS Variables for theming
<div className="bg-background text-foreground">

// 3. Conditional styling
<div className={cn(
  "base-styles",
  variant === "primary" && "primary-styles",
  className
)}>
```

## Performance Optimizations

### Code Splitting Strategies

```typescript
// 1. Route-based splitting (automatic with App Router)
app/dashboard/page.tsx → dashboard.chunk.js

// 2. Component-based splitting
const FileViewer = lazy(() => import('./FileViewer'))

// 3. Feature-based splitting
const { DashboardComponents } = await import('@/features/dashboard')
```

### Optimistic UI Updates

```typescript
function useFileUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadFile,
    onMutate: (file) => {
      // Optimistically add file to UI
      queryClient.setQueryData(['files'], (old) => [...old, file]);
    },
    onError: (error, file) => {
      // Revert on error
      queryClient.setQueryData(['files'], (old) =>
        old.filter((f) => f.id !== file.id)
      );
    },
  });
}
```

### Image Optimization

```typescript
// Next.js Image component with optimization
<Image
  src={thumbnail}
  alt={fileName}
  width={200}
  height={150}
  placeholder="blur"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
/>
```

## Data Flow Architecture

### Unidirectional Data Flow

```
API/S3 → React Query → Components → User Actions → API/S3
   ↑                                                     ↓
   └─────────────── Optimistic Updates ─────────────────┘
```

### Error Boundary Strategy

```typescript
// Feature-level error boundaries
<ErrorBoundary fallback={<DashboardError />}>
  <DashboardFeature />
</ErrorBoundary>

// Component-level error handling
function FileList() {
  const { data, error, isLoading } = useFiles()

  if (error) return <FileListError error={error} />
  if (isLoading) return <FileListSkeleton />

  return <FileItems files={data} />
}
```

## Testing Strategy

### Testing Pyramid

```
┌─────────────┐
│   E2E Tests │ ← Playwright (critical user flows)
├─────────────┤
│ Integration │ ← React Testing Library (component interactions)
├─────────────┤
│ Unit Tests  │ ← Jest/Vitest (utility functions, hooks)
└─────────────┘
```

### Component Testing Pattern

```typescript
test('FileItem displays file information correctly', () => {
  const mockFile = createMockFile({ name: 'document.pdf', size: 1024 })

  render(<FileItem file={mockFile} />)

  expect(screen.getByText('document.pdf')).toBeInTheDocument()
  expect(screen.getByText('1 KB')).toBeInTheDocument()
})
```

## Development Workflow

### Feature Development Process

1. **Plan the Feature**
   - Define types in `features/[feature]/types/`
   - Create API functions in `lib/`

2. **Build Components Bottom-Up**
   - Start with shared UI primitives
   - Build feature-specific components
   - Compose into views

3. **Add Routing & Navigation**
   - Create pages in `app/`
   - Update navigation components

4. **Test & Polish**
   - Add unit tests for logic
   - Integration tests for components
   - E2E tests for critical flows

### Code Review Guidelines

- **Architecture**: Does it follow feature-based organization?
- **Types**: Are all props and functions properly typed?
- **Performance**: Are there unnecessary re-renders or large bundles?
- **Accessibility**: Is the component keyboard navigable and screen reader
  friendly?
- **Testing**: Are the critical paths covered by tests?

## Best Practices

### Component Design

```typescript
// ✅ Good: Focused, single responsibility
function FileItem({ file, onAction }: FileItemProps) {
  return (
    <div className="file-item">
      <FileIcon type={file.extension} />
      <span>{file.name}</span>
      <FileActions onAction={onAction} />
    </div>
  )
}

// ❌ Avoid: Too many responsibilities
function FileItemWithEverything({ file, folder, user, settings }) {
  // Handles files, folders, user data, settings...
}
```

### State Management

```typescript
// ✅ Good: Local state for UI concerns
const [isMenuOpen, setIsMenuOpen] = useState(false);

// ✅ Good: Server state for data
const { data: files } = useQuery(['files', folderId], fetchFiles);

// ❌ Avoid: Global state for everything
const { files, setFiles, isMenuOpen, setIsMenuOpen } = useGlobalState();
```

### Import Organization

```typescript
// ✅ Good: Grouped and aliased imports
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/shared/components/ui/button';
import { FileItem } from '@/features/dashboard/types/file';
import { useFiles } from '@/lib/api-client';

import { cn } from './utils';
```

---

_This architecture scales from small features to enterprise applications while
maintaining code quality and developer experience._
