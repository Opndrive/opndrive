import { FileText, LucidePresentation as FilePresentation, FileQuestion } from 'lucide-react';
import { BsFiletypeExe } from 'react-icons/bs';
import type { FileExtension } from '@/features/dashboard/types/file';
import { FaFileAudio, FaFileImage, FaFilePdf, FaFileVideo, FaRegFileCode } from 'react-icons/fa6';
import { LuFileSpreadsheet } from 'react-icons/lu';
import { FaFileArchive, FaFileContract, FaBook, FaHammer } from 'react-icons/fa';
import { SiDocker } from 'react-icons/si';

interface FileIconProps {
  extension?: FileExtension;
  filename?: string;
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

export function FileIcon({ extension, filename, className = 'h-4 w-4' }: FileIconProps) {
  // Enhanced special file detection
  const getSpecialFileIcon = (filename: string) => {
    const lowerFilename = filename.toLowerCase();

    // License files
    if (lowerFilename === 'license' || lowerFilename.startsWith('license.')) {
      return <FaFileContract className={`${className} text-amber-500`} />;
    }

    // README files
    if (lowerFilename === 'readme' || lowerFilename.startsWith('readme.')) {
      return <FaBook className={`${className} text-blue-500`} />;
    }

    // Docker files
    if (lowerFilename === 'dockerfile' || lowerFilename.startsWith('dockerfile.')) {
      return <SiDocker className={`${className} text-blue-400`} />;
    }

    // Make files
    if (lowerFilename === 'makefile' || lowerFilename.startsWith('makefile.')) {
      return <FaHammer className={`${className} text-orange-500`} />;
    }

    // Changelog
    if (lowerFilename === 'changelog' || lowerFilename.startsWith('changelog.')) {
      return <FileText className={`${className} text-green-500`} />;
    }

    // Contributing
    if (lowerFilename === 'contributing' || lowerFilename.startsWith('contributing.')) {
      return <FileText className={`${className} text-purple-500`} />;
    }

    // Other common files
    if (
      ['authors', 'contributors', 'copying', 'install', 'news', 'todo'].some(
        (name) => lowerFilename === name || lowerFilename.startsWith(name + '.')
      )
    ) {
      return <FileText className={`${className} text-gray-500`} />;
    }

    return null;
  };

  // First check if we have a filename (for files without extensions)
  if (filename) {
    const specialIcon = getSpecialFileIcon(filename);
    if (specialIcon) {
      return specialIcon;
    }
  } // If we have an extension, use it
  if (extension && extension.trim() !== '' && extension !== 'unknown') {
    const colorClass = getFileIconColor(extension as FileExtension);
    const iconClass = `${className} ${colorClass}`;

    switch (extension) {
      case 'pdf':
        return <FaFilePdf className={iconClass} />;

      // Executables
      case 'exe':
      case 'msi':
      case 'dmg':
      case 'deb':
      case 'rpm':
      case 'appimage':
        return <BsFiletypeExe className={iconClass} />;

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
        return <LuFileSpreadsheet className={iconClass} />;

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
        return <FaFileImage className={iconClass} />;

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
        return <FaFileVideo className={iconClass} />;

      // Audio
      case 'mp3':
      case 'wav':
      case 'flac':
      case 'aac':
      case 'ogg':
      case 'wma':
      case 'm4a':
      case 'opus':
        return <FaFileAudio className={iconClass} />;

      // Archives
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
      case 'bz2':
      case 'xz':
        return <FaFileArchive className={iconClass} />;

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
        return <FaRegFileCode className={iconClass} />;

      default:
        return <FileQuestion className={iconClass} />;
    }
  }

  // Final fallback for files without extensions that aren't special
  return <FileQuestion className={`${className} text-muted-foreground`} />;
}

export function FileIconLarge({ extension, filename, className = 'h-16 w-16' }: FileIconProps) {
  return <FileIcon extension={extension} filename={filename} className={className} />;
}
