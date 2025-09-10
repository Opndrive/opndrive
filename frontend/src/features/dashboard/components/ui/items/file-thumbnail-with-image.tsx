import React, { useState, useEffect } from 'react';
import { FileIconLarge } from '@/shared/components/icons/file-icons';
import { s3PreviewService } from '@/services/s3-preview-service';
import { checkPreviewEligibility } from '@/services/file-size-limits';
import { FileItem } from '@/features/dashboard/types/file';
import {
  FileExtension,
  getFileBackground,
  canHaveThumbnailPreview,
} from '@/config/file-extensions';

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

  useEffect(() => {
    async function loadImagePreview() {
      // Only try to load preview for files that can have thumbnail previews
      if (!canHaveThumbnailPreview(name) || !file) {
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
  if (canHaveThumbnailPreview(name) && showImage && imageUrl) {
    return (
      <div
        className={`${className} ${getFileBackground(extension)} border-b border-border/50 overflow-hidden relative`}
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

  // Default behavior for all other files
  return (
    <div
      className={`${className} ${getFileBackground(extension)} flex items-center justify-center border-b border-border/50`}
    >
      <FileIconLarge extension={extension} className="h-16 w-16" />
    </div>
  );
}
