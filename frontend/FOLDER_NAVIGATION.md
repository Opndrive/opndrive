# Enhanced Folder Navigation System

## Overview

This document describes the new enhanced routing system for folder navigation in
the Opndrive application, designed to work seamlessly with S3's prefix-based
storage system.

## Routing Structure

### New Route: `/dashboard/browse`

The main folder browsing route that supports query parameters:

```
/dashboard/browse?prefix=documents/projects/&key=projects&maxKeys=100&token=continuation_token
```

**Query Parameters:**

- `prefix` - S3 prefix path (e.g., `documents/projects/`)
- `key` - Folder identifier from backend (typically the folder name)
- `maxKeys` - Maximum number of items to load (optional)
- `token` - Continuation token for pagination (optional)

### Legacy Routes (Deprecated)

The following routes are now deprecated but still functional:

- `/dashboard/[...path]`
- `/dashboard/folder/[...path]`

## Key Features

### 1. S3-Native Architecture

- Works directly with S3 prefixes instead of artificial folder IDs
- Supports S3's continuation token pagination
- Handles unlimited folder nesting depth

### 2. Backend Key Integration

- Supports the backend "key" variable containing folder names
- Maintains compatibility with existing S3 API structure
- Enables advanced folder operations and permissions

### 3. Enhanced Performance

- Query parameter caching for better performance
- Reduces unnecessary route parsing overhead
- Supports pagination for large directories

### 4. SEO-Friendly URLs

- Clean, readable URLs with meaningful parameters
- Proper breadcrumb navigation
- Bookmarkable folder locations

## Implementation Details

### Core Files

1. **`/app/dashboard/browse/page.tsx`**
   - Main browse page component
   - Handles query parameter parsing
   - Manages folder navigation logic

2. **`/lib/folder-navigation.ts`**
   - Utility functions for URL generation
   - Parameter parsing and validation
   - Breadcrumb navigation helpers

3. **`/components/dashboard/layout/enhanced-folder-breadcrumb.tsx`**
   - Enhanced breadcrumb component
   - Supports key parameter display
   - Custom navigation callbacks

### Usage Examples

```typescript
import {
  generateFolderUrl,
  buildFolderClickUrl,
} from '@/lib/folder-navigation';

// Navigate to a specific folder
const url = generateFolderUrl({
  prefix: 'documents/projects/',
  key: 'projects',
});
router.push(url);

// Handle folder click
const handleFolderClick = (folder: Folder) => {
  const url = buildFolderClickUrl(currentPrefix, folder.name);
  router.push(url);
};
```

## Migration Guide

### For Existing Components

1. **Update folder click handlers:**

   ```typescript
   // Before
   router.push(`/dashboard/folder/${folderName}/`);

   // After
   const url = generateFolderUrl({ prefix: `${folderName}/`, key: folderName });
   router.push(url);
   ```

2. **Update breadcrumb navigation:**
   ```typescript
   // Use EnhancedFolderBreadcrumb instead of FolderBreadcrumb
   <EnhancedFolderBreadcrumb
     pathSegments={pathSegments}
     currentKey={keyParam}
     onNavigate={(prefix, key) => {
       const url = generateFolderUrl({ prefix, key });
       router.push(url);
     }}
   />
   ```

## Benefits

### For Users

- ✅ Faster folder navigation
- ✅ Bookmarkable folder URLs
- ✅ Better browser back/forward support
- ✅ Pagination support for large folders

### For Developers

- ✅ Clean, maintainable code
- ✅ S3-native architecture
- ✅ Extensible for future features
- ✅ Better error handling and debugging

### For Backend Integration

- ✅ Native support for backend key variables
- ✅ Supports S3 continuation tokens
- ✅ Compatible with existing S3 API structure
- ✅ Enables advanced folder permissions

## Future Enhancements

1. **Folder Sharing**: Direct shareable URLs with permission tokens
2. **Search Integration**: Search within specific folder contexts
3. **Advanced Caching**: Intelligent cache invalidation strategies
4. **Offline Support**: Progressive Web App capabilities

## API Integration

The new routing system integrates seamlessly with your existing S3 API:

```typescript
// The browse page automatically calls:
await apiS3.fetchDirectoryStructure(
  prefix, // From URL prefix parameter
  maxKeys, // From URL maxKeys parameter or default
  token // From URL token parameter for pagination
);
```

This ensures compatibility with your current backend implementation while
providing enhanced functionality.
