/**
 * Centralized File Extension Configuration
 *
 * This file contains all file extension definitions, categorizations,
 * and related configurations used throughout the application.
 *
 * To add new extensions:
 * 1. Add to FILE_EXTENSIONS type
 * 2. Add to appropriate category in FILE_CATEGORIES
 * 3. Add styling in getFileBackground if needed
 * 4. Extension will automatically work everywhere in the app
 */

// All supported file extensions
export type FileExtension =
  // Documents
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'txt'
  | 'rtf'
  | 'odt'
  // Spreadsheets
  | 'xls'
  | 'xlsx'
  | 'csv'
  | 'ods'
  | 'xlsm'
  | 'xlsb'
  // Presentations
  | 'ppt'
  | 'pptx'
  | 'odp'
  // Images
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'bmp'
  | 'svg'
  | 'ico'
  | 'tiff'
  | 'tif'
  | 'heic'
  | 'avif'
  // Videos
  | 'mp4'
  | 'mkv'
  | 'avi'
  | 'mov'
  | 'wmv'
  | 'flv'
  | 'webm'
  | 'ogv'
  | 'm4v'
  | '3gp'
  | 'mpg'
  | 'mpeg'
  // Audio
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'aac'
  | 'ogg'
  | 'wma'
  | 'm4a'
  | 'opus'
  // Archives
  | 'zip'
  | 'rar'
  | '7z'
  | 'tar'
  | 'gz'
  | 'bz2'
  | 'xz'
  // Code files
  | 'js'
  | 'ts'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'scss'
  | 'sass'
  | 'less'
  | 'json'
  | 'xml'
  | 'yaml'
  | 'yml'
  | 'toml'
  | 'ini'
  | 'cfg'
  | 'conf'
  | 'py'
  | 'java'
  | 'cpp'
  | 'c'
  | 'cs'
  | 'php'
  | 'rb'
  | 'go'
  | 'rust'
  | 'rs'
  | 'sql'
  | 'sh'
  | 'bat'
  | 'ps1'
  | 'md'
  | 'mdx'
  // Executables
  | 'exe'
  | 'msi'
  | 'dmg'
  | 'deb'
  | 'rpm'
  | 'appimage'
  // Other
  | 'unknown';

// File category definitions
export const FILE_CATEGORIES = {
  document: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'] as const,
  spreadsheet: ['.xls', '.xlsx', '.csv', '.ods', '.xlsm', '.xlsb'] as const,
  presentation: ['.ppt', '.pptx', '.odp'] as const,
  image: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.ico',
    '.tiff',
    '.tif',
    '.heic',
    '.avif',
  ] as const,
  video: [
    '.mp4',
    '.mkv',
    '.avi',
    '.mov',
    '.wmv',
    '.flv',
    '.webm',
    '.ogv',
    '.m4v',
    '.3gp',
    '.mpg',
    '.mpeg',
  ] as const,
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus'] as const,
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'] as const,
  code: [
    // JavaScript/TypeScript
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.mjs',
    '.cjs',
    // Web Technologies
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
    // Data/Config
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.env',
    // Documentation
    '.md',
    '.mdx',
    '.rst',
    // Python
    '.py',
    '.pyw',
    '.pyi',
    // Java/JVM
    '.java',
    '.kt',
    '.kts',
    '.scala',
    '.groovy',
    '.clj',
    // C/C++
    '.c',
    '.h',
    '.cpp',
    '.cxx',
    '.cc',
    '.hpp',
    '.hxx',
    // C#/.NET
    '.cs',
    '.vb',
    '.fs',
    '.fsx',
    // Other Languages
    '.php',
    '.phtml',
    '.rb',
    '.rbw',
    '.rake',
    '.gemspec',
    '.go',
    '.rs',
    '.rust',
    '.swift',
    '.m',
    '.mm',
    '.mlx',
    '.r',
    '.R',
    '.pl',
    '.pm',
    '.t',
    '.dart',
    '.lua',
    '.hs',
    '.lhs',
    '.erl',
    '.ex',
    '.exs',
    '.ml',
    '.mli',
    // Shell/Scripts
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.bat',
    '.cmd',
    '.ps1',
    // Database
    '.sql',
    '.mysql',
    '.pgsql',
    '.sqlite',
    // Assembly & Special
    '.asm',
    '.s',
    '.wat',
    '.wast',
  ] as const,
  executable: ['.exe', '.msi', '.dmg', '.deb', '.rpm', '.appimage'] as const,
} as const;

// Type for file categories
export type FileCategory = keyof typeof FILE_CATEGORIES;

// Language mapping for syntax highlighting in code preview
export const SYNTAX_LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Web Technologies
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',

  // Data/Config
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'properties',
  '.conf': 'properties',
  '.env': 'properties',

  // Documentation
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  '.rst': 'restructuredtext',

  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  '.ipynb': 'python',

  // Java/JVM
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',
  '.clj': 'clojure',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',

  // C#/.NET
  '.cs': 'csharp',
  '.vb': 'vbnet',

  // F# (moved here to avoid duplication)
  '.fs': 'fsharp',
  '.fsx': 'fsharp',

  // PHP
  '.php': 'php',
  '.phtml': 'php',

  // Ruby
  '.rb': 'ruby',
  '.rbw': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',
  '.rust': 'rust',

  // Swift
  '.swift': 'swift',

  // Objective-C/MATLAB (both use .m extension)
  '.m': 'objectivec', // Default to Objective-C, can be overridden based on content
  '.mm': 'objectivec',
  '.mlx': 'matlab',

  // R
  '.r': 'r',
  '.R': 'r',

  // Perl
  '.pl': 'perl',
  '.pm': 'perl',
  '.t': 'perl',

  // Shell/Bash
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.bat': 'batch',
  '.cmd': 'batch',
  '.ps1': 'powershell',

  // Database
  '.sql': 'sql',
  '.mysql': 'sql',
  '.pgsql': 'sql',
  '.sqlite': 'sql',

  // Web Assembly
  '.wat': 'wasm',
  '.wast': 'wasm',

  // Dart
  '.dart': 'dart',

  // Lua
  '.lua': 'lua',

  // Haskell
  '.hs': 'haskell',
  '.lhs': 'haskell',

  // Erlang/Elixir
  '.erl': 'erlang',
  '.ex': 'elixir',
  '.exs': 'elixir',

  // OCaml
  '.ml': 'ocaml',
  '.mli': 'ocaml',

  // Assembly
  '.asm': 'assembly',
  '.s': 'assembly',

  // Dockerfile
  '.dockerfile': 'dockerfile',
  Dockerfile: 'dockerfile',

  // GitIgnore
  '.gitignore': 'gitignore',
  '.gitattributes': 'gitignore',

  // Other config files
  '.makefile': 'makefile',
  Makefile: 'makefile',
  '.cmake': 'cmake',
  'CMakeLists.txt': 'cmake',
  '.gradle': 'gradle',
  '.properties': 'properties',
};

// Get syntax highlighting language for a file
export function getSyntaxLanguage(filename: string): string {
  const extension = getFileExtension(filename);
  const baseFilename = filename.toLowerCase();

  // Check for special filenames first (like Dockerfile, Makefile)
  if (SYNTAX_LANGUAGE_MAP[baseFilename]) {
    return SYNTAX_LANGUAGE_MAP[baseFilename];
  }

  // Then check by extension
  return SYNTAX_LANGUAGE_MAP[extension] || 'text';
}

// Check if a file supports syntax highlighting
export function supportsSyntaxHighlighting(filename: string): boolean {
  return getSyntaxLanguage(filename) !== 'text';
}

// All extensions as a flat array
export const ALL_EXTENSIONS = Object.values(FILE_CATEGORIES).flat();

// File size limits for preview (in bytes)
export const PREVIEW_SIZE_LIMITS = {
  image: 25 * 1024 * 1024, // 25MB
  video: 100 * 1024 * 1024, // 100MB
  document: 50 * 1024 * 1024, // 50MB
  spreadsheet: 10 * 1024 * 1024, // 10MB
  presentation: 50 * 1024 * 1024, // 50MB
  audio: 50 * 1024 * 1024, // 50MB
  code: 5 * 1024 * 1024, // 5MB
  archive: 0, // No preview
  executable: 0, // No preview
} as const;

// Previewable categories
export const PREVIEWABLE_CATEGORIES: FileCategory[] = [
  'image',
  'video',
  'document',
  'spreadsheet',
  'code',
];

// Thumbnail previewable categories (for grid view)
export const THUMBNAIL_PREVIEWABLE_CATEGORIES: FileCategory[] = [
  'image', // Only images show actual thumbnails
];

/**
 * Utility Functions
 */

// Extract file extension from filename
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

// Get file extension without dot
export function getFileExtensionWithoutDot(filename: string): string {
  const ext = getFileExtension(filename);
  return ext.replace('.', '');
}

// Get file category from filename
export function getFileCategory(filename: string): FileCategory | null {
  const extension = getFileExtension(filename);

  for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
    if ((extensions as readonly string[]).includes(extension)) {
      return category as FileCategory;
    }
  }

  return null;
}

// Check if file is in specific category
export function isFileInCategory(filename: string, category: FileCategory): boolean {
  return getFileCategory(filename) === category;
}

// Check if file is previewable
export function isFilePreviewable(filename: string): boolean {
  const category = getFileCategory(filename);
  return category ? PREVIEWABLE_CATEGORIES.includes(category) : false;
}

// Check if file can have thumbnail preview
export function canHaveThumbnailPreview(filename: string): boolean {
  const category = getFileCategory(filename);
  return category ? THUMBNAIL_PREVIEWABLE_CATEGORIES.includes(category) : false;
}

// Get preview size limit for file
export function getPreviewSizeLimit(filename: string): number {
  const category = getFileCategory(filename);
  return category ? PREVIEW_SIZE_LIMITS[category] : 0;
}

// Get background color for file type (for thumbnails)
export function getFileBackground(extension: FileExtension): string {
  const category = getFileCategory(`.${extension}`);

  switch (category) {
    case 'document':
      return extension === 'pdf'
        ? 'bg-red-50 dark:bg-red-900/30'
        : 'bg-blue-50 dark:bg-blue-900/30';
    case 'spreadsheet':
      return 'bg-green-50 dark:bg-green-900/30';
    case 'presentation':
      return 'bg-orange-50 dark:bg-orange-900/30';
    case 'image':
      return 'bg-purple-50 dark:bg-purple-900/30';
    case 'video':
      return 'bg-pink-50 dark:bg-pink-900/30';
    case 'audio':
      return 'bg-yellow-50 dark:bg-yellow-900/30';
    case 'archive':
      return 'bg-gray-50 dark:bg-gray-800/30';
    case 'code':
      return 'bg-cyan-50 dark:bg-cyan-900/30';
    case 'executable':
      return 'bg-amber-50 dark:bg-amber-900/30';
    default:
      return 'bg-muted/50';
  }
}

// Get file category display name
export function getCategoryDisplayName(category: FileCategory): string {
  const names: Record<FileCategory, string> = {
    document: 'Document',
    spreadsheet: 'Spreadsheet',
    presentation: 'Presentation',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    archive: 'Archive',
    code: 'Code',
    executable: 'Executable',
  };

  return names[category] || 'Unknown';
}

// MIME type mappings for file extensions
export const MIME_TYPE_MAP: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.avif': 'image/avif',

  // Videos
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',

  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',

  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',

  // Spreadsheets
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xlsb': 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',

  // Presentations
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odp': 'application/vnd.oasis.opendocument.presentation',

  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
  '.xz': 'application/x-xz',

  // Code files
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.jsx': 'text/javascript',
  '.tsx': 'text/typescript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/scss',
  '.sass': 'text/sass',
  '.less': 'text/less',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.py': 'text/x-python',
  '.java': 'text/x-java-source',
  '.cpp': 'text/x-c++src',
  '.c': 'text/x-csrc',
  '.cs': 'text/x-csharp',
  '.php': 'text/x-php',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rust': 'text/x-rust',
  '.rs': 'text/x-rust',
  '.sql': 'text/x-sql',
  '.sh': 'text/x-shellscript',
  '.bat': 'text/x-msdos-batch',
  '.ps1': 'text/x-powershell',
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',

  // Executables
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.msi': 'application/x-msi',
  '.dmg': 'application/x-apple-diskimage',
  '.deb': 'application/vnd.debian.binary-package',
  '.rpm': 'application/x-rpm',
  '.appimage': 'application/x-executable',
};

// Get MIME type for a file
export function getMimeType(filename: string): string {
  const extension = getFileExtension(filename);
  return MIME_TYPE_MAP[extension] || 'application/octet-stream';
}

// Get content type for S3 signed URL (optimized for browser compatibility)
export function getContentTypeForS3(filename: string): string {
  const extension = getFileExtension(filename);
  const mimeType = MIME_TYPE_MAP[extension];

  if (!mimeType) {
    return 'application/octet-stream';
  }

  // For some file types, we want to ensure they display inline in browsers
  const category = getFileCategory(filename);

  switch (category) {
    case 'image':
    case 'video':
    case 'audio':
      // These should always use specific MIME types for proper browser rendering
      return mimeType;

    case 'document':
      // PDFs should open inline, others might download
      if (extension === '.pdf') {
        return 'application/pdf';
      }
      return mimeType;

    case 'code':
      // Text-based files should be viewable inline
      return mimeType;

    default:
      return mimeType;
  }
}

// Check if file supports a specific feature
export function supportsFeature(
  filename: string,
  feature: 'preview' | 'thumbnail' | 'download'
): boolean {
  switch (feature) {
    case 'preview':
      return isFilePreviewable(filename);
    case 'thumbnail':
      return canHaveThumbnailPreview(filename);
    case 'download':
      return true; // All files can be downloaded
    default:
      return false;
  }
}
