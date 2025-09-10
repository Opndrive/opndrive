import { FileIconLarge } from '@/shared/components/icons/file-icons';
import { FileExtension, getFileBackground } from '@/config/file-extensions';

interface FileThumbnailProps {
  extension: FileExtension;
  _name: string;
  className?: string;
}

export function FileThumbnail({ extension, _name, className = 'w-full h-32' }: FileThumbnailProps) {
  return (
    <div
      className={`${className} ${getFileBackground(extension)} flex items-center justify-center border-b border-border/50`}
    >
      <FileIconLarge extension={extension} className="h-16 w-16" />
    </div>
  );
}
