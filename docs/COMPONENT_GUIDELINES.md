# Component Guidelines

This guide explains how components are organized, designed, and used in
OpnDrive. Following these guidelines ensures consistency, maintainability, and
scalability across the codebase.

## Component Philosophy

Our component architecture follows these principles:

1. **Single Responsibility** - Each component has one clear purpose
2. **Composition Over Inheritance** - Build complex UIs by combining simple
   components
3. **Accessibility First** - All components are keyboard navigable and screen
   reader friendly
4. **Type Safety** - Comprehensive TypeScript coverage with strict typing
5. **Performance Optimized** - Minimal re-renders and efficient bundle sizes

## 📁 Component Organization

### Hierarchy Levels

```
src/
├── shared/components/           # 🌐 Global, reusable components
│   ├── ui/                     # Basic UI primitives (Button, Input, etc.)
│   ├── layout/                 # Layout components (Header, Footer, etc.)
│   └── icons/                  # Icon components
├── features/[feature]/components/  # 🎯 Feature-specific components
│   ├── layout/                 # Feature layout components
│   ├── ui/                     # Feature UI components
│   └── views/                  # Page-level view components
└── app/                        # 📄 Next.js pages and layouts
```

### Component Categories

#### 1. **Shared UI Components** (`/shared/components/ui/`)

Basic building blocks used throughout the application:

```typescript
// Button.tsx - A reusable button component
interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
  children: React.ReactNode
}

export function Button({ variant = 'default', size = 'default', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  )
}
```

#### 2. **Feature Components** (`/features/[feature]/components/`)

Business logic components specific to a feature:

```typescript
// FileItem.tsx - Dashboard-specific file component
interface FileItemProps {
  file: FileItem
  view: 'grid' | 'list'
  onAction?: (action: string, file: FileItem) => void
  className?: string
}

export function FileItem({ file, view, onAction, className }: FileItemProps) {
  // Feature-specific logic here
  return view === 'grid' ? (
    <FileItemGrid file={file} onAction={onAction} className={className} />
  ) : (
    <FileItemList file={file} onAction={onAction} className={className} />
  )
}
```

#### 3. **Layout Components** (`/components/layout/`)

Structure and navigation components:

```typescript
// DashboardLayout.tsx - Dashboard-specific layout
interface DashboardLayoutProps {
  children: React.ReactNode
  showSidebar?: boolean
  showBreadcrumb?: boolean
}

export function DashboardLayout({ children, showSidebar = true, showBreadcrumb = true }: DashboardLayoutProps) {
  return (
    <div className="dashboard-layout">
      <DashboardNavbar />
      {showSidebar && <DashboardSidebar />}
      <main className="dashboard-main">
        {showBreadcrumb && <DashboardBreadcrumb />}
        {children}
      </main>
    </div>
  )
}
```

#### 4. **View Components** (`/components/views/`)

Page-level components that compose multiple components:

```typescript
// DashboardHome.tsx - Complete dashboard home view
export function DashboardHome() {
  const { data: files } = useFiles()
  const { data: folders } = useFolders()

  return (
    <div className="dashboard-home">
      <DriveHero />
      <div className="content-grid">
        <SuggestedFolders folders={folders} />
        <SuggestedFiles files={files} />
      </div>
    </div>
  )
}
```

## Component Design Patterns

### 1. Compound Components

For components with multiple related parts:

```typescript
// FileExplorer compound component
const FileExplorer = ({ children }: { children: React.ReactNode }) => {
  return <div className="file-explorer">{children}</div>
}

const FileExplorerHeader = ({ children }: { children: React.ReactNode }) => {
  return <header className="file-explorer-header">{children}</header>
}

const FileExplorerContent = ({ children }: { children: React.ReactNode }) => {
  return <main className="file-explorer-content">{children}</main>
}

// Usage
<FileExplorer>
  <FileExplorer.Header>
    <SearchBar />
    <ViewToggle />
  </FileExplorer.Header>
  <FileExplorer.Content>
    <FileGrid files={files} />
  </FileExplorer.Content>
</FileExplorer>
```

### 2. Render Props

For flexible component composition:

```typescript
interface DataLoaderProps<T> {
  load: () => Promise<T>
  children: (data: { data: T | null; loading: boolean; error: Error | null }) => React.ReactNode
}

function DataLoader<T>({ load, children }: DataLoaderProps<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Loading logic...

  return children({ data, loading, error })
}

// Usage
<DataLoader load={() => fetchFiles(folderId)}>
  {({ data: files, loading, error }) => {
    if (loading) return <FileSkeleton />
    if (error) return <ErrorMessage error={error} />
    return <FileGrid files={files} />
  }}
</DataLoader>
```

### 3. Custom Hooks for Logic

Extract complex logic into custom hooks:

```typescript
// useFileSelection.ts
export function useFileSelection(files: FileItem[]) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const selectFile = useCallback((fileId: string) => {
    setSelectedFiles((prev) => new Set([...prev, fileId]));
  }, []);

  const deselectFile = useCallback((fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(files.map((f) => f.id)));
  }, [files]);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  return {
    selectedFiles,
    selectFile,
    deselectFile,
    selectAll,
    clearSelection,
    selectedCount: selectedFiles.size,
  };
}
```

### 4. Higher-Order Components (HOCs)

For cross-cutting concerns:

```typescript
// withErrorBoundary.tsx
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error }>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}

// Usage
const SafeFileGrid = withErrorBoundary(FileGrid, FileGridError)
```

## 📝 Component Standards

### Naming Conventions

```typescript
// ✅ Good: PascalCase for components
export function FileItemGrid() {}
export function DashboardNavbar() {}

// ✅ Good: camelCase for functions and variables
const handleFileSelect = () => {};
const isLoading = true;

// ✅ Good: SCREAMING_SNAKE_CASE for constants
const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB

// ❌ Avoid: Ambiguous names
export function Component() {} // What kind of component?
export function Item() {} // What kind of item?
```

### Props Interface Design

```typescript
// ✅ Good: Clear, specific props
interface FileItemProps {
  file: FileItem; // Required data
  view: 'grid' | 'list'; // Required configuration
  selected?: boolean; // Optional state
  onSelect?: (file: FileItem) => void; // Optional callbacks
  onAction?: (action: string, file: FileItem) => void;
  className?: string; // Optional styling
}

// ❌ Avoid: Vague or overly generic props
interface ItemProps {
  data: any;
  config: object;
  handlers: { [key: string]: Function };
}
```

### Default Props Pattern

```typescript
// ✅ Good: Use default parameters
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  ...props
}: ButtonProps) {
  // Component implementation
}

// ❌ Avoid: defaultProps (deprecated in function components)
Button.defaultProps = {
  variant: 'primary',
  size: 'md',
};
```

## Styling Guidelines

### CSS-in-JS with Tailwind

Use Tailwind classes with the `cn` utility for conditional styling:

```typescript
import { cn } from '@/lib/utils'

interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined'
  className?: string
}

export function Card({ variant = 'default', className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        // Base styles
        'rounded-lg p-4',
        // Variant styles
        {
          'bg-card text-card-foreground shadow-sm': variant === 'default',
          'bg-card text-card-foreground shadow-lg': variant === 'elevated',
          'border border-border bg-transparent': variant === 'outlined'
        },
        // Custom className
        className
      )}
      {...props}
    />
  )
}
```

### Design System Integration

Use design tokens from the theme:

```typescript
// ✅ Good: Use semantic color classes
<div className="bg-background text-foreground border-border">
  <h2 className="text-primary">Title</h2>
  <p className="text-muted-foreground">Description</p>
</div>

// ❌ Avoid: Hard-coded colors
<div className="bg-white text-black border-gray-200">
  <h2 className="text-blue-600">Title</h2>
  <p className="text-gray-500">Description</p>
</div>
```

### Responsive Design

```typescript
<div className={cn(
  // Mobile first
  'grid grid-cols-1 gap-4',
  // Tablet
  'md:grid-cols-2 md:gap-6',
  // Desktop
  'lg:grid-cols-3 lg:gap-8',
  // Large screens
  'xl:grid-cols-4'
)}>
```

## ♿ Accessibility Standards

### Keyboard Navigation

```typescript
export function FileItem({ file, onSelect }: FileItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="file-item focus:ring-2 focus:ring-primary focus:outline-none"
      onClick={() => onSelect(file)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(file)
        }
      }}
      aria-label={`Select file ${file.name}`}
    >
      <FileIcon type={file.extension} />
      <span>{file.name}</span>
    </div>
  )
}
```

### ARIA Labels and Roles

```typescript
export function SearchBar({ onSearch }: SearchBarProps) {
  return (
    <div role="search" className="search-bar">
      <label htmlFor="search-input" className="sr-only">
        Search files and folders
      </label>
      <input
        id="search-input"
        type="search"
        placeholder="Search files and folders..."
        aria-describedby="search-help"
        onChange={(e) => onSearch(e.target.value)}
      />
      <div id="search-help" className="sr-only">
        Enter keywords to search through your files and folders
      </div>
    </div>
  )
}
```

### Screen Reader Support

```typescript
// Use semantic HTML
<nav aria-label="Dashboard navigation">
  <ul>
    {navItems.map(item => (
      <li key={item.id}>
        <Link
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
        >
          {item.label}
        </Link>
      </li>
    ))}
  </ul>
</nav>

// Provide context for dynamic content
<div aria-live="polite" aria-atomic="true">
  {uploading && <span>Uploading file... {progress}% complete</span>}
</div>
```

## State Management in Components

### Local State

Use `useState` for component-specific state:

```typescript
export function FileUploadDialog() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Component logic...
}
```

### Derived State

Use `useMemo` for computed values:

```typescript
export function FileList({ files, searchQuery }: FileListProps) {
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files
    return files.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [files, searchQuery])

  return <FileGrid files={filteredFiles} />
}
```

### Effect Management

Use `useEffect` for side effects:

```typescript
export function FileViewer({ fileId }: FileViewerProps) {
  const [file, setFile] = useState<FileItem | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadFile = async () => {
      try {
        const fileData = await fetchFile(fileId)
        if (!cancelled) {
          setFile(fileData)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load file:', error)
        }
      }
    }

    loadFile()

    return () => {
      cancelled = true
    }
  }, [fileId])

  if (!file) return <FileSkeleton />
  return <FileContent file={file} />
}
```

## Testing Components

### Component Testing

```typescript
// FileItem.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { FileItem } from './FileItem'

const mockFile = {
  id: '1',
  name: 'document.pdf',
  extension: 'pdf',
  size: { value: 1024, unit: 'KB' }
}

test('renders file information correctly', () => {
  render(<FileItem file={mockFile} view="grid" />)

  expect(screen.getByText('document.pdf')).toBeInTheDocument()
  expect(screen.getByText('1 KB')).toBeInTheDocument()
})

test('calls onSelect when clicked', () => {
  const onSelect = jest.fn()
  render(<FileItem file={mockFile} view="grid" onSelect={onSelect} />)

  fireEvent.click(screen.getByRole('button'))
  expect(onSelect).toHaveBeenCalledWith(mockFile)
})
```

### Custom Hook Testing

```typescript
// useFileSelection.test.ts
import { renderHook, act } from '@testing-library/react';
import { useFileSelection } from './useFileSelection';

test('selects and deselects files correctly', () => {
  const files = [mockFile1, mockFile2];
  const { result } = renderHook(() => useFileSelection(files));

  act(() => {
    result.current.selectFile('1');
  });

  expect(result.current.selectedFiles.has('1')).toBe(true);
  expect(result.current.selectedCount).toBe(1);

  act(() => {
    result.current.deselectFile('1');
  });

  expect(result.current.selectedFiles.has('1')).toBe(false);
  expect(result.current.selectedCount).toBe(0);
});
```

## 📋 Component Checklist

Before marking a component as complete, ensure it meets these criteria:

### ✅ Functionality

- [ ] Component serves a single, clear purpose
- [ ] All props are properly typed
- [ ] Default values are provided where appropriate
- [ ] Error states are handled gracefully

### ✅ Accessibility

- [ ] Keyboard navigation works correctly
- [ ] Screen reader friendly (proper ARIA labels)
- [ ] Focus management is implemented
- [ ] Color contrast meets WCAG standards

### ✅ Performance

- [ ] No unnecessary re-renders
- [ ] Heavy computations are memoized
- [ ] Event handlers are stable (useCallback)
- [ ] Large lists use virtualization if needed

### ✅ Styling

- [ ] Uses design system tokens
- [ ] Responsive on all screen sizes
- [ ] Dark mode compatible
- [ ] Consistent with design guidelines

### ✅ Testing

- [ ] Unit tests cover main functionality
- [ ] Edge cases are tested
- [ ] Accessibility features are tested
- [ ] Performance characteristics are verified

### ✅ Documentation

- [ ] Props are documented with JSDoc
- [ ] Usage examples are provided
- [ ] Complex logic is commented
- [ ] Storybook stories exist (if applicable)

---

_Following these guidelines ensures our components are maintainable, accessible,
and provide a great user experience across all devices and assistive
technologies._
