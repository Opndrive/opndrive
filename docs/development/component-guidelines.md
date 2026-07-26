# Component Guidelines

This guide explains how components are organized and used in Opndrive. It's
written for developers who want to understand or contribute to the component
system.

## Component Philosophy

Opndrive follows these simple principles:

1. **Keep it Simple** - Each component does one thing well
2. **Reuse When Possible** - Build new features by combining existing components
3. **Make it Accessible** - All components work with keyboards and screen
   readers
4. **Use TypeScript** - Everything has proper types for better development
   experience
5. **Stay Consistent** - Follow the same patterns throughout the app

## How Components Are Organized

```
src/
├── shared/components/           # Components used everywhere
│   ├── ui/                     # Basic building blocks (Button, Input, etc.)
│   ├── layout/                 # Layout pieces (containers, etc.)
│   └── icons/                  # Icon components
├── features/[feature]/components/  # Components specific to one feature
│   ├── layout/                 # Feature-specific layout
│   ├── ui/                     # Feature-specific UI pieces
│   └── views/                  # Complete page views
└── app/                        # Next.js pages that use the components
```

## Types of Components

### 1. **Shared UI Components** (`/shared/components/ui/`)

These are the basic building blocks used throughout the app:

```typescript
// Button example from the actual codebase
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

### 2. **Feature Components** (`/features/[feature]/components/`)

Components that are specific to one part of the app, like dashboard or file
upload:

```typescript
// Example: File item component
interface FileItemProps {
  file: FileItem
  view: 'grid' | 'list'
  onSelect?: (file: FileItem) => void
}

export function FileItem({ file, view, onSelect }: FileItemProps) {
  return (
    <div
      className={`file-item ${view === 'grid' ? 'grid-view' : 'list-view'}`}
      onClick={() => onSelect?.(file)}
    >
      <FileIcon extension={file.extension} />
      <span>{file.name}</span>
    </div>
  )
}
```

### 3. **Layout Components** (`/components/layout/`)

Components that structure pages and organize other components:

```typescript
// Dashboard layout that wraps the main dashboard pages
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <DashboardNavbar />
      <DashboardSidebar />
      <main className="dashboard-content">
        {children}
      </main>
    </div>
  )
}
```

## How Opndrive Actually Builds Components

### Styling with Tailwind + CVA

Opndrive uses Tailwind CSS with Class Variance Authority (CVA) for consistent
styling:

```typescript
// How button variants are actually defined
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border bg-background hover:bg-accent',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
      },
    },
  }
);
```

### Using Radix UI Components

Many components are built on top of Radix UI for accessibility:

```typescript
// Dialog component example
import * as Dialog from '@radix-ui/react-dialog'

export function FilePreviewDialog({ file, open, onOpenChange }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <FilePreview file={file} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Context for Shared State

Opndrive uses React Context for sharing state between components:

```typescript
// Example: File selection context
const FileSelectionContext = createContext<{
  selectedFiles: Set<string>;
  selectFile: (id: string) => void;
  clearSelection: () => void;
} | null>(null);

export function useFileSelection() {
  const context = useContext(FileSelectionContext);
  if (!context) {
    throw new Error(
      'useFileSelection must be used within FileSelectionProvider'
    );
  }
  return context;
}
```

## Simple Patterns You'll See

### 1. Custom Hooks for Logic

Instead of putting complex logic in components, Opndrive extracts it into custom
hooks:

```typescript
// useUpload hook handles file upload logic
export function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const uploadFile = async (file: File) => {
    setUploading(true)
    // Upload logic here...
    setUploading(false)
  }

  return { uploading, progress, uploadFile }
}

// Components use the hook
export function UploadButton() {
  const { uploading, uploadFile } = useUpload()

  return (
    <Button
      disabled={uploading}
      onClick={() => uploadFile()}
    >
      {uploading ? 'Uploading...' : 'Upload File'}
    </Button>
  )
}
```

### 2. Compound Components

For complex components with multiple parts:

```typescript
// Dashboard is a compound component
export function Dashboard({ children }) {
  return <div className="dashboard">{children}</div>
}

Dashboard.Navbar = function DashboardNavbar({ children }) {
  return <nav className="dashboard-navbar">{children}</nav>
}

Dashboard.Content = function DashboardContent({ children }) {
  return <main className="dashboard-content">{children}</main>
}

// Usage
<Dashboard>
  <Dashboard.Navbar>
    <SearchBar />
  </Dashboard.Navbar>
  <Dashboard.Content>
    <FileGrid />
  </Dashboard.Content>
</Dashboard>
```

## Writing Good Components

### Keep Props Simple

```typescript
// ✅ Good: Clear, specific props
interface FileItemProps {
  file: FileItem; // The data
  selected?: boolean; // Current state
  onSelect?: () => void; // What to do when clicked
}

// ❌ Avoid: Complex or vague props
interface ItemProps {
  data: any; // What kind of data?
  config: object; // What configuration?
  handlers: { [key: string]: Function }; // Too generic
}
```

### Use TypeScript Properly

```typescript
// ✅ Good: Specific types
interface UploadProgressProps {
  progress: number; // 0-100
  fileName: string;
  status: 'uploading' | 'completed' | 'error';
}

// ❌ Avoid: Generic types
interface ProgressProps {
  data: any;
  state: string;
}
```

### Make Components Accessible

```typescript
export function FileItem({ file, onSelect }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select file ${file.name}`}
      className="file-item focus:ring-2 focus:ring-blue-500"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect()
        }
      }}
    >
      <FileIcon type={file.type} />
      <span>{file.name}</span>
    </div>
  )
}
```

## Testing Components

Opndrive uses React Testing Library for component tests:

```typescript
// FileItem.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { FileItem } from './FileItem'

test('renders file name', () => {
  const file = { name: 'document.pdf', type: 'pdf' }
  render(<FileItem file={file} />)

  expect(screen.getByText('document.pdf')).toBeInTheDocument()
})

test('calls onSelect when clicked', () => {
  const onSelect = jest.fn()
  const file = { name: 'document.pdf', type: 'pdf' }

  render(<FileItem file={file} onSelect={onSelect} />)
  fireEvent.click(screen.getByRole('button'))

  expect(onSelect).toHaveBeenCalled()
})
```

## Component Checklist

Before submitting a new component, make sure it:

- [ ] **Has clear props** - Easy to understand what it needs
- [ ] **Is accessible** - Works with keyboard and screen readers
- [ ] **Uses consistent styling** - Follows the Tailwind + CVA pattern
- [ ] **Has TypeScript types** - All props and state are typed
- [ ] **Is tested** - Basic functionality is covered by tests
- [ ] **Follows naming conventions** - PascalCase for components, camelCase for
      props

## Getting Help

- **Look at existing components** - See how similar components are built
- **Check the shared components** - Many basic pieces already exist
- **Ask questions** - Create a GitHub issue if you're stuck

---

_This guide covers the patterns actually used in Opndrive. Keep it simple, make
it accessible, and follow the existing patterns!_
