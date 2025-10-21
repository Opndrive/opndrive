# Route-Based File Preview Implementation

## Overview

This implementation adds a route-based preview system to complement the existing
modal preview. Users can now open files in new tabs with shareable URLs while
maintaining the quick modal preview for in-context viewing.

## Architecture

### Two Preview Modes

#### 1. **Modal Preview** (Existing - Preserved)

- **Location**: `src/components/file-preview/file-preview-modal.tsx`
- **Context**: `FilePreviewContext` (src/context/file-preview-context.tsx)
- **Use Case**: Quick file preview while browsing
- **Features**:
  - Overlay/sheet interface (z-50 fixed positioning)
  - Multi-file navigation (prev/next arrows)
  - Keyboard shortcuts (ESC to close, arrows to navigate)
  - Stays in current page context
  - State managed via React Context

#### 2. **Route-Based Preview** (New)

- **Location**: `src/app/dashboard/preview/[etag]/page.tsx`
- **URL Format**: `/dashboard/preview/{etag}?key={encodedKey}`
- **Use Case**: Opening files in new tabs, sharing, bookmarking
- **Features**:
  - Full-page preview with clean URL (full viewport, no dashboard UI)
  - No navbar, no sidebar, no padding - immersive preview experience
  - Shareable and bookmarkable
  - Browser back/forward navigation works
  - Single file focus (no prev/next navigation)
  - Independent from current browsing context

## Implementation Details

### 1. File Identification Strategy

- **Primary Identifier**: ETag (S3 object version identifier)
  - Unique per file version
  - Immutable (changes if file changes)
  - Secure (unpredictable)
  - Cleaned of quotes for URL compatibility
- **Secondary Parameter**: S3 Key (via query param)
  - Full path to file in S3
  - Used for fetching file metadata
  - URL encoded for safety

### 2. File Structure

```
src/
├── app/
│   └── dashboard/
│       └── preview/
│           ├── layout.tsx              # Minimal layout (no sidebar/navbar)
│           └── [etag]/
│               └── page.tsx            # Preview page component
├── lib/
│   └── preview-url.ts                  # URL generation utilities
└── features/
    └── dashboard/
        └── components/
            └── ui/
                └── menus/
                    └── file-overflow-menu.tsx  # Updated with new tab action
```

### 3. Key Components

#### `/app/dashboard/preview/[etag]/page.tsx`

```typescript
// Main preview page component
- Handles authentication via useAuthGuard()
- Fetches file metadata from S3 using key
- Verifies ETag matches URL parameter
- Renders full-screen preview using existing preview components
- Shows loading/error states appropriately
```

#### `/lib/preview-url.ts`

```typescript
// Utility functions for URL management
- generatePreviewUrl({ etag, key }): Creates preview URL
- openPreviewInNewTab({ etag, key }): Opens URL in new tab
- parsePreviewUrl(url): Extracts etag and key from URL
```

#### Updated: `/features/dashboard/components/ui/menus/file-overflow-menu.tsx`

```typescript
// Modified "Open in new tab" action
- Now uses openPreviewInNewTab() utility
- Passes file's ETag and Key
- Properly handles missing values
```

### 4. URL Structure

**Format**: `/dashboard/preview/{etag}?key={encodedKey}`

**Example**:

```
Original file:
- Key: "documents/2024/report.pdf"
- ETag: "\"5d41402abc4b2a76b9719d911017c592\""

Generated URL:
/dashboard/preview/5d41402abc4b2a76b9719d911017c592?key=documents%2F2024%2Freport.pdf
```

### 5. Authentication & Security

- Route protected via dashboard layout authentication
- Uses `useAuthGuard()` hook for additional verification
- Verifies ETag matches S3 metadata (prevents unauthorized access to modified
  files)
- No file listing/enumeration possible (requires both ETag and Key)
- Redirects to home if not authenticated

### 6. Data Flow

```mermaid
User clicks "Open in new tab"
    ↓
openPreviewInNewTab({ etag: file.ETag, key: file.Key })
    ↓
Generates URL: /dashboard/preview/{etag}?key={encodedKey}
    ↓
Opens new browser tab
    ↓
PreviewPage component loads
    ↓
useAuthGuard() verifies authentication
    ↓
Fetches file metadata from S3 via apiS3.fetchMetadata(key)
    ↓
Verifies ETag matches URL parameter
    ↓
Creates PreviewableFile object
    ↓
Renders PreviewHeader + PreviewContent (reuses existing components)
```

## Reused Components

The following existing components are reused for consistency:

- `PreviewHeader`: File info, download button, navigation controls
- `PreviewContent`: Main content viewer (images, PDFs, videos, etc.)
- `PreviewLoading`: Loading spinner/message
- `PreviewError`: Error display with retry option

## API Methods Used

### S3 API

```typescript
// Fetch file metadata by S3 key
apiS3.fetchMetadata(key: string): Promise<HeadObjectCommandOutput | null>

// Returns:
{
  ContentLength: number,
  ContentType: string,
  ETag: string,
  LastModified: Date,
  StorageClass: string,
  // ... other S3 metadata
}
```

## Usage Examples

### In File Overflow Menu

```typescript
import { openPreviewInNewTab } from '@/lib/preview-url';

const handleOpenInNewTab = () => {
  openPreviewInNewTab({
    etag: file.ETag,
    key: file.Key,
  });
};
```

### Custom Implementation

```typescript
import { generatePreviewUrl } from '@/lib/preview-url';

const shareableLink = generatePreviewUrl({
  etag: file.ETag,
  key: file.Key,
});
// Copy to clipboard, share via email, etc.
```

## Testing Checklist

- [ ] Open file in new tab from overflow menu
- [ ] Verify preview loads correctly
- [ ] Test with different file types (images, PDFs, videos, documents)
- [ ] Test authentication (should redirect if not logged in)
- [ ] Test ETag mismatch handling
- [ ] Test missing/invalid parameters (should show 404)
- [ ] Test file not found (should show error)
- [ ] Verify browser back button works
- [ ] Test with long file names
- [ ] Test with special characters in file path
- [ ] Verify download button works in route preview
- [ ] Test closing tab (should close cleanly)

## Future Enhancements (Optional)

1. **Dynamic Metadata**: Show file name in browser tab title
2. **Share Button**: Direct share functionality in route preview
3. **Print Support**: Enhanced print layout for route preview
4. **Fullscreen Mode**: Toggle fullscreen for better viewing
5. **Comment/Annotation**: Add ability to comment on previewed files
6. **Version History**: Show previous versions if available
7. **Related Files**: Suggest files from same folder
8. **Analytics**: Track preview opens for usage insights

## Performance Considerations

- **Lazy Loading**: Preview content loads only after metadata fetch
- **Component Reuse**: Shares viewer components with modal preview
- **Minimal Layout**: No sidebar/navbar in preview route for faster load
- **Suspense Boundaries**: Proper loading states prevent layout shift
- **Error Boundaries**: Graceful error handling for failed loads

## Maintenance Notes

- ETag cleaning handled automatically in URL utilities
- URL encoding handled automatically for special characters
- All preview logic centralized in reusable components
- Auth checks happen at multiple levels (layout, page, API)
- File type detection uses existing centralized config

## Related Files

### Created

- `src/app/dashboard/preview/[etag]/page.tsx` - Preview page
- `src/app/dashboard/preview/layout.tsx` - Minimal layout
- `src/lib/preview-url.ts` - URL utilities

### Modified

- `src/features/dashboard/components/ui/menus/file-overflow-menu.tsx` - Added
  route preview support

### Referenced

- `src/components/file-preview/*` - Reused preview components
- `src/context/file-preview-context.tsx` - Modal preview context
- `src/hooks/use-auth-guard.tsx` - Authentication guard
- `src/types/file-preview.ts` - Type definitions
- `@opndrive/s3-api` - S3 operations

---

**Implementation Status**: ✅ Complete and Ready for Testing
