import type { FileExtension } from '@/types/dashboard/file';
import { FileIconLarge } from '@/components/icons/file-icons';

interface FileThumbnailProps {
  extension: FileExtension;
  _name: string;
  className?: string;
}

export function FileThumbnail({ extension, _name, className = 'w-full h-32' }: FileThumbnailProps) {
  const getBackgroundColor = (ext: FileExtension): string => {
    switch (ext) {
      case 'pdf':
        return 'bg-red-50 dark:bg-red-900/30';
      case 'doc':
      case 'docx':
        return 'bg-blue-50 dark:bg-blue-900/30';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return 'bg-green-50 dark:bg-green-900/30';
      case 'ppt':
      case 'pptx':
        return 'bg-orange-50 dark:bg-orange-900/30';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'svg':
      case 'webp':
        return 'bg-purple-50 dark:bg-purple-900/30';
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
        return 'bg-pink-50 dark:bg-pink-900/30';
      case 'mp3':
      case 'wav':
      case 'flac':
        return 'bg-yellow-50 dark:bg-yellow-900/30';
      case 'zip':
      case 'rar':
      case '7z':
        return 'bg-gray-50 dark:bg-gray-800/30';
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
        return 'bg-cyan-50 dark:bg-cyan-900/30';
      default:
        return 'bg-muted/50';
    }
  };

  return (
    <div
      className={`${className} ${getBackgroundColor(extension)} flex items-center justify-center border-b border-border/50`}
    >
      <FileIconLarge extension={extension} className="h-16 w-16" />
    </div>
  );
}
