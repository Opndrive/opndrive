# Understanding the Opndrive Code

Now that you have Opndrive running, let's take a tour of how the code is
organized. This guide explains everything in simple terms.

## The Big Picture

Opndrive is like a sandwich with three main layers:

```
┌─────────────────────────────────┐
│      Frontend (What you see)    │  ← The web interface (Next.js)
├─────────────────────────────────┤
│      S3 API (The messenger)     │  ← Talks to Amazon S3
├─────────────────────────────────┤
│      Amazon S3 (Your storage)   │  ← Where your files actually live
└─────────────────────────────────┘
```

## Project Structure (The Folders)

When you look at the `opndrive` folder, you'll see:

```
opndrive/
├── frontend/          # The web app you see in your browser
├── s3-api/           # Code that talks to Amazon S3
├── docs/             # Documentation (like this file!)
└── package.json      # Project settings
```

### The Frontend Folder (Where the Magic Happens)

This is where the web interface lives - everything you click and see:

```
frontend/
├── src/              # All the source code
├── public/           # Images and static files
├── package.json      # Frontend dependencies
└── next.config.ts    # Configuration
```

### Inside the Source Code (`frontend/src/`)

```
src/
├── app/              # Pages (like the home page, dashboard)
├── features/         # Major features (dashboard, file upload, etc.)
├── shared/           # Reusable pieces (buttons, icons)
├── context/          # App-wide settings and state
└── services/         # Code that talks to S3
```

## How the Code is Organized (Feature-Based)

Instead of putting all buttons in one folder and all pages in another, Opndrive
groups code by **what it does**:

```
features/
├── dashboard/        # Everything for the main file browser
│   ├── components/   # UI pieces (file lists, folders, menus)
│   ├── services/     # Logic (uploading, downloading, deleting)
│   └── types/        # Data definitions (what a "file" looks like)
├── upload/           # File upload functionality
├── settings/         # App settings and preferences
└── file-management/  # File operations (rename, copy, etc.)
```

## Key Concepts for Beginners

### 1. Components (Building Blocks)

Think of components like LEGO blocks. Each piece does one thing:

- `FileItem` - Shows a single file
- `FolderItem` - Shows a single folder
- `UploadButton` - The upload button
- `Dashboard` - Combines everything into the main interface

### 2. Services (The Workers)

Services handle the actual work:

- `uploadService` - Handles file uploads
- `deleteService` - Handles file deletion
- `s3Service` - Talks to Amazon S3

### 3. Context (Shared Information)

Context is like a bulletin board where different parts of the app can share
information:

- `SettingsContext` - User preferences (upload method, theme)
- `NotificationContext` - Success/error messages
- `DriveStore` - Current files and folders

### 4. Types (Definitions)

TypeScript types define what data looks like:

```typescript
interface FileItem {
  name: string; // "my-document.pdf"
  size: number; // 1024 (in bytes)
  lastModified: Date; // When it was last changed
}
```

## The Data Flow (How Things Connect)

Here's what happens when you click "Upload File":

```
1. You click Upload Button
   ↓
2. FileUpload Component opens file picker
   ↓
3. UploadService handles the file
   ↓
4. S3 API sends file to Amazon S3
   ↓
5. Dashboard refreshes to show new file
```

## Important Files to Know

If you want to make changes, these are the key files:

### For UI Changes:

- `src/app/page.tsx` - The home page
- `src/app/dashboard/page.tsx` - Main dashboard
- `src/features/dashboard/components/` - File browser components

### For Upload Features:

- `src/features/upload/` - Everything upload-related
- `src/features/upload/hooks/use-upload-handler.ts` - Main upload logic

### For Settings:

- `src/features/settings/` - User preferences
- `src/app/connect/page.tsx` - AWS credentials setup

### For S3 Integration:

- `s3-api/src/` - The S3 communication layer
- `src/services/byo-s3-api.ts` - Frontend S3 service

## Technologies Used (What You Should Know)

Opndrive is built with modern web technologies:

- **Next.js** - React framework for building web apps
- **TypeScript** - JavaScript with type checking
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - State management (like Redux but simpler)
- **Amazon S3 SDK** - Official AWS library

## Common Patterns You'll See

### 1. Hook Pattern

```typescript
// Custom hooks start with "use" and contain reusable logic
const { files, uploadFile, deleteFile } = useFileManager();
```

### 2. Component Pattern

```typescript
// Components return JSX (HTML-like syntax)
function FileItem({ file }) {
  return <div className="file-item">{file.name}</div>;
}
```

### 3. Service Pattern

```typescript
// Services contain business logic
class UploadService {
  async uploadFile(file: File) {
    // Upload logic here
  }
}
```

## Where to Start Making Changes

### Easy Changes (Good for beginners):

1. **Styling** - Update colors and spacing in Tailwind classes
2. **Text** - Change button labels and messages
3. **Icons** - Swap out icons in the `shared/components` folder

### Medium Changes:

1. **New components** - Create new UI pieces
2. **Feature improvements** - Enhance existing functionality
3. **Settings** - Add new user preferences

### Advanced Changes:

1. **New features** - Add major functionality
2. **S3 integration** - Modify how we talk to S3
3. **Performance** - Optimize loading and rendering

## Development Workflow

When you want to make changes:

1. **Find the right file** using the structure above
2. **Make your change** in VS Code
3. **Save the file** - the browser automatically refreshes
4. **Test your change** in the browser
5. **Commit your changes** with Git

## Getting Help

- **Stuck on something?** Look at similar components for patterns
- **Need to understand a feature?** Start with the component and follow the data
  flow
- **TypeScript errors?** The editor will show helpful error messages
- **Want to add a feature?** Look at existing features for examples

---

**Next Step**: Ready to make your first change? Continue to
[Making Your First Change](./making-your-first-change.md)
