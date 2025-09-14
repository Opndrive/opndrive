# Project Structure

This document provides a comprehensive overview of OpnDrive's project structure,
designed to help developers understand the codebase organization and navigate
the project efficiently.

## Root Directory Structure

```
opndrive/
├── docs/                          # Documentation files
├── frontend/                      # Next.js Frontend Application
├── s3-api/                       # S3 API Integration Layer
├── CONTRIBUTING.md               #  Contribution guidelines
├── LICENSE                       #  Project license
├── README.md                     #  Main project README
├── eslint.config.mjs            #  ESLint configuration
├── package.json                  #  Root package configuration
├── pnpm-lock.yaml               #  PNPM lock file
└── prettier.config.js           #  Prettier configuration
```

## Frontend Structure (`/frontend`)

The frontend follows a **feature-based architecture** inspired by enterprise
applications like Google Drive and Dropbox.

### Main Directories

```
frontend/
├── public/                       # Static assets
│   └── logo-nobg.png
├── src/                         # Source code
│   ├── app/                     # Next.js App Router
│   ├── shared/                  # Shared utilities and components
│   ├── features/                # Feature-based modules
│   ├── components/              # Legacy components (being migrated)
│   ├── context/                 # React Context providers
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # Utility libraries
│   ├── providers/               # App-level providers
│   ├── services/                # Service layer
│   └── assets/                  # Local assets
├── components.json              # shadcn/ui configuration
├── next.config.ts              # Next.js configuration
├── package.json                # Frontend dependencies
├── tailwind.config.ts          # Tailwind CSS configuration
└── tsconfig.json               # TypeScript configuration
```

### App Router Structure (`/src/app`)

Following Next.js 15 App Router conventions:

```
app/
├── layout.tsx                   # Root layout component
├── page.tsx                     # Landing page
├── not-found.tsx               # 404 error page
├── globals.css                 # Global styles
├── favicon.ico                 # Favicon
├── connect/                    # AWS credentials setup page
│   └── page.tsx
└── dashboard/                  # Dashboard pages
    ├── layout.tsx              # Dashboard layout
    ├── page.tsx                # Dashboard home
    ├── browse/                 # Browse files and folders
    │   └── page.tsx
    ├── search/                 # Search functionality
    │   └── page.tsx
    └── settings/               # App settings
        └── page.tsx
```

### Features Architecture (`/src/features`)

**Enterprise-grade feature organization:**

```
features/
├── dashboard/                   #  Main dashboard feature
│   ├── components/             # Dashboard-specific components
│   │   ├── layout/            # Layout components (navbar, sidebar, breadcrumb)
│   │   ├── ui/                # UI components (items, menus, skeletons, details)
│   │   ├── views/             # Page views (home, search)
│   │   └── index.ts           # Component exports
│   └── types/                 # Dashboard-specific types
│       ├── file.ts            # File-related types
│       └── folder.ts          # Folder-related types
├── file-management/            #  File operations
│   ├── file-helpers.ts        # File utility functions
│   └── folder-helpers.ts      # Folder utility functions
└── folder-navigation/          #  Navigation logic
    └── folder-navigation.ts
```

### Shared Resources (`/src/shared`)

Reusable components and utilities:

```
shared/
├── components/                 # Reusable UI components
│   ├── ui/                    # Basic UI primitives
│   │   ├── button.tsx         # Button component
│   │   ├── input.tsx          # Input component
│   │   ├── dialog.tsx         # Dialog/Modal component
│   │   └── [other-ui]/        # More UI components
│   ├── icons/                 # Icon components
│   │   ├── file-icons.tsx     # File type icons
│   │   ├── folder-icons.tsx   # Folder icons
│   │   └── index.ts           # Icon exports
│   └── layout/                # Layout components
│       └── loading-bar.tsx    # Loading indicator
└── ...                        # Other shared resources
```

## S3 API Structure (`/s3-api`)

Backend integration layer:

```
s3-api/
├── src/                        # Source code
│   ├── core/                  # Core functionality
│   │   ├── index.ts           # Main exports
│   │   └── types.ts           # Type definitions
│   ├── utils/                 # Utility functions
│   │   └── multipartUploader.ts
│   └── tests/                 # Test files
│       └── byoS3.test.ts
├── package.json               # API dependencies
├── tsconfig.json             # TypeScript config
└── vitest.config.ts          # Test configuration
```

## Key Architectural Patterns

### 1. **Feature-Based Organization**

- Each feature contains its own components, types, and logic
- Clear separation of concerns
- Easy to scale and maintain

### 2. **Component Hierarchy**

```
features/dashboard/components/
├── layout/          # Layout-level components (navbar, sidebar)
├── ui/              # Business-specific UI components
│   ├── items/       # Item display components
│   ├── menus/       # Context menus and dropdowns
│   ├── details/     # Detail panels and sidebars
│   └── skeletons/   # Loading skeletons
└── views/           # Page-level view components
    ├── home/        # Home dashboard view
    └── search/      # Search interface
```

### 3. **Import Aliasing**

Clean import paths using TypeScript path aliases:

```typescript
// Good: Clean imports
import { Button } from '@/shared/components/ui/button';
import { FileItem } from '@/features/dashboard/types/file';
import { useDriveStore } from '@/context/data-context';
import { DashboardNavbar } from '@/features/dashboard/components/layout/navbar/dashboard-navbar';

// Avoid: Relative imports
import { Button } from '../../../shared/components/ui/button';
```

### 4. **Type Organization**

- Feature-specific types in `features/[feature]/types/`
- Shared types in `lib/` or `shared/types/`
- Strict TypeScript configuration for type safety

## Navigation & Routing

### Current Routing Pattern

```typescript
// app/dashboard/page.tsx - Dashboard home
// app/dashboard/browse/page.tsx - Browse files and folders
// Navigation handled through state management and components
```

### S3 Integration

- Prefix-based navigation using S3 object keys
- Dynamic breadcrumbs based on folder hierarchy
- Real-time file/folder operations
- State-driven navigation rather than URL-based routing

## Styling & Theming

- **Tailwind CSS** for utility-first styling
- **shadcn/ui** for high-quality component primitives
- **CSS Variables** for theme customization
- **Dark/Light mode** support

## File Naming Conventions

kebab-case

## Code Organization Tips

### For New Developers:

1. **Start with `/src/app`** - Understand the page structure
2. **Explore `/src/features/dashboard`** - See how features are organized
3. **Check `/src/shared`** - Find reusable components
4. **Review types** - Understand the data models

### Adding New Features:

1. Create a new folder in `/src/features/`
2. Add components in organized subfolders
3. Define types in a `types/` subdirectory
4. Export everything through `index.ts` files
5. Update path aliases if needed

## Benefits of This Structure

- **Scalability**: Easy to add new features without affecting existing code
- **Maintainability**: Clear separation makes debugging and updates simple
- **Team Collaboration**: Multiple developers can work on different features
- **Code Reusability**: Shared components prevent duplication
- **Type Safety**: Comprehensive TypeScript coverage
- **Enterprise Ready**: Follows patterns used by major tech companies

---

_This structure is designed to grow with your project while maintaining clarity
and organization._
