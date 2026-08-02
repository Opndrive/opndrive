'use client';

export interface FolderStructure {
  name: string;
  files: File[];
  totalSize: number;
  relativePath: string;
}

/**
 * Something the extraction could not include, and why.
 *
 * Extraction is best-effort by design: one locked file must not abandon the
 * folder around it. But "best effort" only works if the effort that failed is
 * reported. Before this existed, a file that could not be read was dropped in a
 * bare `catch {}` with no log, so a folder could upload short and neither the
 * user nor the code downstream had any way to know.
 */
export interface SkippedEntry {
  /** Path relative to the drop, e.g. `photos/raw/img.cr2`. */
  path: string;
  /** Human-readable, shown to the user as-is. */
  reason: string;
  kind: 'file' | 'folder';
}

export interface ProcessedDragData {
  individualFiles: File[];
  folderStructures: FolderStructure[];
  /**
   * Required, not optional, and deliberately so: an optional error channel is
   * one every caller forgets. Producers must say `[]` to mean "nothing was
   * lost".
   */
  skipped: SkippedEntry[];
}

export interface WebKitDirectoryEntry extends FileSystemDirectoryEntry {
  name: string;
  fullPath: string;
  isDirectory: true;
  isFile: false;
}

export interface WebKitFileEntry extends FileSystemFileEntry {
  name: string;
  fullPath: string;
  isDirectory: false;
  isFile: true;
}

export type WebKitEntry = WebKitDirectoryEntry | WebKitFileEntry;

export interface FolderUploadProgress {
  folderId: string;
  folderName: string;
  uploadedFiles: number;
  totalFiles: number;
  currentFileProgress: number;
  overallProgress: number;
}
