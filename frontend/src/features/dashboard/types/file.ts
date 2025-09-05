import { _Object } from '@aws-sdk/client-s3';
import type React from 'react';

export type DataUnits = 'B' | 'KB' | 'MB' | 'GB' | 'TB';

export interface FileItem extends _Object {
  id: string;
  name: string;
  extension: string;
  size: {
    value: number;
    unit: DataUnits;
  };
  lastModified?: Date;
  lastOpened?: Date;
  owner?: { id: string; name: string; email: string; avatar?: string };
  location?: { type: 'my-drive' | 'shared-with-me' | 'folder'; path: string; folderId?: string };
  isShared?: boolean;
  reasonSuggested?: string;
  thumbnail?: string;
}

export type FileExtension =
  | 'pdf'
  | 'exe'
  | 'doc'
  | 'docx'
  | 'txt'
  | 'rtf'
  | 'xls'
  | 'xlsx'
  | 'csv'
  | 'ppt'
  | 'pptx'
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'svg'
  | 'webp'
  | 'mp4'
  | 'mkv'
  | 'avi'
  | 'mov'
  | 'wmv'
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'zip'
  | 'rar'
  | '7z'
  | 'js'
  | 'ts'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'json'
  | 'py'
  | 'java'
  | 'cpp'
  | 'c'
  | 'unknown';

export type ViewLayout = 'grid' | 'list';

export interface FileMenuAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  hasSubmenu?: boolean;
  onClick?: (file: FileItem) => void;
}
