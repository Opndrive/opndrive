import { _Object } from '@aws-sdk/client-s3';
import type React from 'react';

export interface FileItem extends _Object {
  name: string;
  extension: string;
  size: number;
}

export type FileExtension =
  | 'pdf'
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
