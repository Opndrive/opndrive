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

import type { FileExtension } from '@/features/dashboard/types/file';

interface FileIconProps {
  extension: FileExtension;
  className?: string;
}

const getFileIconColor = (extension: FileExtension): string => {
  switch (extension) {
    // Documents
    case 'pdf':
      return 'text-red-500';
    case 'doc':
    case 'docx':
    case 'txt':
    case 'rtf':
    case 'odt':
      return 'text-blue-500';

    // Spreadsheets
    case 'xls':
    case 'xlsx':
    case 'csv':
    case 'ods':
    case 'xlsm':
    case 'xlsb':
      return 'text-green-500';

    // Presentations
    case 'ppt':
    case 'pptx':
    case 'odp':
      return 'text-orange-500';

    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'bmp':
    case 'ico':
    case 'tiff':
    case 'tif':
    case 'heic':
    case 'avif':
      return 'text-purple-500';

    // Videos
    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
    case 'webm':
    case 'ogv':
    case 'm4v':
    case '3gp':
    case 'mpg':
    case 'mpeg':
      return 'text-pink-500';

    // Audio
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'aac':
    case 'ogg':
    case 'wma':
    case 'm4a':
    case 'opus':
      return 'text-yellow-500';

    // Archives
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
    case 'bz2':
    case 'xz':
      return 'text-gray-500';

    // Code
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'json':
    case 'xml':
    case 'yaml':
    case 'yml':
    case 'md':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
    case 'cs':
    case 'php':
    case 'rb':
    case 'go':
    case 'rs':
    case 'sql':
    case 'sh':
    case 'bat':
    case 'ps1':
      return 'text-cyan-500';

    // Executables
    case 'exe':
    case 'msi':
    case 'dmg':
    case 'deb':
    case 'rpm':
    case 'appimage':
      return 'text-yellow-600';

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

    // Executables
    case 'exe':
    case 'msi':
    case 'dmg':
    case 'deb':
    case 'rpm':
    case 'appimage':
      return <BsFillGearFill className={iconClass} />;

    // Documents
    case 'doc':
    case 'docx':
    case 'txt':
    case 'rtf':
    case 'odt':
      return <FileText className={iconClass} />;

    // Spreadsheets
    case 'xls':
    case 'xlsx':
    case 'csv':
    case 'ods':
    case 'xlsm':
    case 'xlsb':
      return <FileSpreadsheet className={iconClass} />;

    // Presentations
    case 'ppt':
    case 'pptx':
    case 'odp':
      return <FilePresentation className={iconClass} />;

    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'bmp':
    case 'ico':
    case 'tiff':
    case 'tif':
    case 'heic':
    case 'avif':
      return <FileImage className={iconClass} />;

    // Videos
    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
    case 'webm':
    case 'ogv':
    case 'm4v':
    case '3gp':
    case 'mpg':
    case 'mpeg':
      return <FileVideo className={iconClass} />;

    // Audio
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'aac':
    case 'ogg':
    case 'wma':
    case 'm4a':
    case 'opus':
      return <FileAudio className={iconClass} />;

    // Archives
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
    case 'bz2':
    case 'xz':
      return <Archive className={iconClass} />;

    // Code
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'json':
    case 'xml':
    case 'yaml':
    case 'yml':
    case 'md':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
    case 'cs':
    case 'php':
    case 'rb':
    case 'go':
    case 'rs':
    case 'sql':
    case 'sh':
    case 'bat':
    case 'ps1':
      return <Code className={iconClass} />;

    default:
      return <FileQuestion className={iconClass} />;
  }
}

export function FileIconLarge({ extension, className = 'h-16 w-16' }: FileIconProps) {
  return <FileIcon extension={extension} className={className} />;
}
