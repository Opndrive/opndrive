import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  Archive,
  Code,
  FilePen as FilePdf,
  LucidePresentation as FilePresentation,
  FileQuestion,
} from 'lucide-react';
import { BsFillGearFill } from 'react-icons/bs';

import type { FileExtension } from '@/types/dashboard/file';

interface FileIconProps {
  extension: FileExtension;
  className?: string;
}

const getFileIconColor = (extension: FileExtension): string => {
  switch (extension) {
    case 'pdf':
      return 'text-red-500';
    case 'exe':
      return 'text-yellow-500';
    case 'doc':
    case 'docx':
      return 'text-blue-500';
    case 'xls':
    case 'xlsx':
    case 'csv':
      return 'text-green-500';
    case 'ppt':
    case 'pptx':
      return 'text-orange-500';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return 'text-purple-500';
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
      return 'text-pink-500';
    case 'mp3':
    case 'wav':
    case 'flac':
      return 'text-yellow-500';
    case 'zip':
    case 'rar':
    case '7z':
      return 'text-gray-500';
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'json':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
      return 'text-cyan-500';
    default:
      return 'text-muted-foreground';
  }
};

export function FileIcon({ extension, className = 'h-4 w-4' }: FileIconProps) {
  const colorClass = getFileIconColor(extension);
  const iconClass = `${className} ${colorClass}`;

  switch (extension) {
    case 'pdf':
      return <FilePdf className={iconClass} />;
    case 'exe':
      return <BsFillGearFill className={iconClass} />;
    case 'doc':
    case 'docx':
    case 'txt':
    case 'rtf':
      return <FileText className={iconClass} />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className={iconClass} />;
    case 'ppt':
    case 'pptx':
      return <FilePresentation className={iconClass} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage className={iconClass} />;
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
      return <FileVideo className={iconClass} />;
    case 'mp3':
    case 'wav':
    case 'flac':
      return <FileAudio className={iconClass} />;
    case 'zip':
    case 'rar':
    case '7z':
      return <Archive className={iconClass} />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'json':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
      return <Code className={iconClass} />;
    default:
      return <FileQuestion className={iconClass} />;
  }
}

export function FileIconLarge({ extension, className = 'h-16 w-16' }: FileIconProps) {
  return <FileIcon extension={extension} className={className} />;
}
