'use client';

export interface FolderStructure {
  name: string;
  files: File[];
  totalSize: number;
  relativePath: string;
}

export interface ProcessedDragData {
  individualFiles: File[];
  folderStructures: FolderStructure[];
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
