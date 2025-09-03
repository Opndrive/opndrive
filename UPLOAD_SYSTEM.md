# Upload System Documentation

## Overview

The upload system provides file and folder upload functionality to S3 with
real-time progress tracking, queue management, and multipart upload methods.

## Status: ✅ Production Ready

The upload system is fully implemented and production-ready:

- ✅ File upload (single and multiple)
- ✅ Folder upload with directory structure preservation
- ✅ Real-time progress tracking
- ✅ Queue management with upload card UI
- ✅ AWS S3 integration with multipart uploads
- ✅ Error handling and retry mechanisms
- ✅ Professional file picker utilities
- ✅ Clean codebase (debugging logs removed)

## Architecture

### Core Components

1. **Upload Store** (`use-upload-store.ts`) - Zustand state management
2. **Upload Handler** (`use-upload-handler.ts`) - Main upload logic and S3
   integration
3. **File Picker** (`file-picker.ts`) - Professional file selection utility
4. **Upload Card** (`upload-card.tsx`) - UI component for progress tracking
5. **Create Menu** (`create-menu.tsx`) - Entry point for upload triggers

## Upload Flow

### 1. File Selection

```
User clicks "File upload" → File picker opens → Files selected → Upload queue created
```

### 2. Folder Selection

```
User clicks "Folder upload" → Folder picker opens → Folder selected → All files extracted → Upload queue created
```

### 3. Queue Processing

```
Files added to queue → Sequential processing → S3 upload → Progress tracking → Completion
```

### 4. S3 Integration

```
File → S3 Key generation → Multipart upload → Progress callbacks → Success/Error handling
```

## S3 Integration Details

### Environment Variables Required

```bash
NEXT_PUBLIC_AWS_ACCESS_KEY_ID="your-access-key"
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY="your-secret-key"
NEXT_PUBLIC_AWS_REGION="your-region"
NEXT_PUBLIC_BUCKET_NAME="your-bucket-name"
```

### S3 API Methods Used

#### Primary Upload Method: `uploadMultipart()`

- **Purpose**: Reliable upload for all file sizes
- **Parameters**:
  ```typescript
  {
    file: File,
    key: string,
    onProgress?: (progress: number) => void
  }
  ```
- **Benefits**: Works for any file size, provides progress tracking, handles
  network interruptions

#### Alternative Method: `uploadMultipartParallely()`

- **Purpose**: Concurrent chunk upload for large files
- **Parameters**:
  ```typescript
  {
    file: File,
    key: string,
    partSizeMB: 5,
    concurrency: 3,
    onProgress?: (progress: number) => void
  }
  ```

### S3 Key Generation

#### Function: `generateS3Key(fileName, currentPath)`

```typescript
// Input: fileName = "document.pdf", currentPath = "/folder1/"
// Output: "folder1/document.pdf"

// Input: fileName = "image.jpg", currentPath = "/"
// Output: "image.jpg"
```

#### Folder Upload Key Generation

```typescript
// Input: relativePath = "MyFolder/subfolder/file.txt", currentPath = "/documents/"
// Output: "documents/MyFolder/subfolder/file.txt"

// Input: relativePath = "MyFolder/image.jpg", currentPath = "/"
// Output: "MyFolder/image.jpg"
```

**Key Rules:**

- ❌ No leading slashes (S3 requirement)
- ✅ Proper path concatenation
- ✅ Root folder handling
- ✅ Preserves folder structure from `webkitRelativePath`

## Upload Methods

### Auto Method (Default)

- **Small files**: Direct multipart upload
- **Large files**: Multipart upload with progress tracking

### Multipart Method

- Uses AWS S3 multipart upload API
- 5MB chunks by default
- Sequential chunk upload

### Multipart-Concurrent Method

- Parallel chunk uploads
- Configurable concurrency (default: 3)
- Faster for large files with good network

## File Types Supported

- **All file types** (`accept="*/*"`)
- **Size limits**: None (handled by multipart)
- **Extensions**: Automatically detected and stored

## Folder Upload Implementation

### How It Works

1. **Folder Selection**: Uses `webkitdirectory` attribute for folder picker
2. **File Extraction**: Extracts all files from selected folder
3. **Structure Preservation**: Maintains folder hierarchy using
   `webkitRelativePath`
4. **Sequential Upload**: Uploads files one by one to avoid overwhelming S3
5. **Progress Tracking**: Shows both overall progress and file count

### Key Features

- **Nested Folders**: Supports unlimited folder depth
- **File Count Display**: Shows "X of Y files" progress
- **Error Recovery**: Individual file failures don't stop entire folder upload
- **Memory Efficient**: Processes files sequentially to avoid memory issues

### Technical Details

```typescript
// Folder upload data structure
{
  name: "MyFolder",
  type: "folder",
  size: 15728640,           // Total size of all files
  files: File[],            // Array of all files in folder
  uploadedFiles: 5,         // Number of completed uploads
  totalFiles: 10,           // Total files in folder
  progress: 50              // Overall progress percentage
}
```

### Browser Compatibility

- **Chrome/Edge**: Full support with `webkitdirectory`
- **Firefox**: Full support with `webkitdirectory`
- **Safari**: Full support with `webkitdirectory`
- **Mobile**: Limited support (fallback to file upload)

## Progress Tracking

### Progress Data Structure

```typescript
{
  itemId: string,
  progress: number,        // 0-100
  uploadedFiles?: number,  // For folders
  totalFiles?: number      // For folders
}
```

### UI Updates

- Real-time progress bars
- Queue status indicators
- Upload speed estimation
- Error state handling

## Error Handling

### Common Errors

1. **"Key starting with /"** - Fixed by S3 key generation
2. **Network timeouts** - Handled by multipart retry logic
3. **Invalid credentials** - Throws authentication error
4. **Bucket permissions** - Throws access denied error

### Error Recovery

- Automatic retry for network issues
- Clear error messages in UI
- Graceful degradation

## Current Implementation Status

### ✅ Production Ready Features

- Single file upload
- **Folder upload with nested structure**
- Progress tracking for files and folders
- Queue management
- S3 integration with multipart upload
- Error handling and recovery
- CSS variable styling
- Real-time progress updates
- **Clean codebase** (all debugging logs removed)

### 📋 Future Enhancements

- Pause/resume functionality
- Upload speed optimization
- Thumbnail generation
- Duplicate file handling
- Drag & drop support

## Code Quality

The upload system maintains high code quality standards:

- **No console logs** - All debugging output removed for production
- **Type safety** - Full TypeScript coverage
- **Error handling** - Comprehensive error recovery
- **Memory efficient** - Sequential processing prevents memory issues
- **Clean architecture** - Separation of concerns with dedicated utilities

## Usage Example

```typescript
// Basic file upload
const { handleFileUpload } = useUploadHandler({
  currentPath: '/documents/',
  uploadMethod: 'auto',
});

// Upload files
await handleFileUpload(fileList);
```

## Performance Considerations

- **Memory**: Files processed sequentially to avoid memory issues
- **Network**: Multipart upload handles poor connections
- **UI**: Non-blocking progress updates
- **S3 Costs**: Optimized chunk sizes for cost efficiency

## Security

- **Client-side validation**: File type and size checks
- **S3 permissions**: Bucket-level access control
- **Credential handling**: Environment variables only
- **No server storage**: Direct S3 upload
