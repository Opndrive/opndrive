import React, { useState, useEffect } from 'react';
import type { FileExtension } from '@/features/dashboard/types/file';
import { FileIconLarge } from '@/shared/components/icons/file-icons';
import { s3PreviewService } from '@/services/s3-preview-service';
import { checkPreviewEligibility, getFileExtension } from '@/services/file-size-limits';
import { FileItem } from '@/features/dashboard/types/file';

interface FileThumbnailWithImageProps {
  extension: FileExtension;
  name: string;
  file?: FileItem;
  className?: string;
}

export function FileThumbnailWithImage({
  extension,
  name,
  file,
  className = 'w-full h-32',
}: FileThumbnailWithImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);

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
      case 'mkv':
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

  // Check if file is an image
  const isImageFile = () => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    return imageExtensions.includes(getFileExtension(name));
  };

  useEffect(() => {
    async function loadImagePreview() {
      // Only try to load preview for images
      if (!isImageFile() || !file) {
        return;
      }

      // Check file size eligibility
      const fileSize = file.size?.value || 0;
      const eligibility = checkPreviewEligibility(name, fileSize);

      if (!eligibility.canPreview) {
        return;
      }

      try {
        // Create preview file object
        const previewFile = {
          id: file.id || file.Key || name,
          name: name,
          key: file.Key || file.id || name,
          size: fileSize,
          type: extension,
          lastModified: file.lastModified || new Date(),
        };

        const url = await s3PreviewService.getSignedUrl(previewFile);
        setImageUrl(url);
        setShowImage(true);
      } catch (error) {
        // Silently fail and show regular icon
        setShowImage(false);
        console.error('Error loading image preview:', error);
      }
    }

    loadImagePreview();
  }, [file?.Key, name, file?.size, extension]);

  const handleImageError = () => {
    setShowImage(false);
    setImageUrl(null);
  };

  // If it's an image and we have a preview URL, show the image
  if (isImageFile() && showImage && imageUrl) {
    return (
      <div
        className={`${className} ${getBackgroundColor(extension)} border-b border-border/50 overflow-hidden relative`}
      >
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={handleImageError}
          loading="lazy"
        />
      </div>
    );
  }

  // Default behavior for all other files (same as original FileThumbnail)
  return (
    <div
      className={`${className} ${getBackgroundColor(extension)} flex items-center justify-center border-b border-border/50`}
    >
      <FileIconLarge extension={extension} className="h-16 w-16" />
    </div>
  );
}
