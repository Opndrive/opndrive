import React, { useState, useEffect, useRef } from 'react';
import { FileIconLarge } from '@/shared/components/icons/file-icons';
import { forgetThumbnailUrl, thumbnailUrlFor } from '@/services/thumbnail-urls';
import { FileItem } from '@/features/dashboard/types/file';
import {
  FileExtension,
  getFileBackground,
  canHaveThumbnailPreview,
  THUMBNAIL_SIZE_LIMIT,
} from '@/config/file-extensions';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { PreviewLoading } from '@/components/file-preview/preview-loading';

interface FileThumbnailWithImageProps {
  extension: FileExtension;
  filename?: string;
  name: string;
  file?: FileItem;
  className?: string;
}

/**
 * A grid tile's picture: the image itself when it is small enough to fetch
 * for a tile, its file icon otherwise.
 */
export function FileThumbnailWithImage({
  extension,
  filename,
  name,
  file,
  className = 'w-full h-32',
}: FileThumbnailWithImageProps) {
  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  const key = file?.Key;
  // Bytes, from the listing. `file.size` is for display - 2.4 for "2.4 MB" -
  // and the gate used to compare that number with a limit in bytes. A display
  // number never reaches a thousand, so every image passed, however large.
  const bytes = file?.Size;
  const version = file?.ETag ?? file?.lastModified?.toISOString();
  const wantsImage =
    Boolean(key) &&
    canHaveThumbnailPreview(name) &&
    typeof bytes === 'number' &&
    bytes <= THUMBNAIL_SIZE_LIMIT;

  // Which object the URL belongs to, so a tile reused for another file never
  // shows the previous one's image while the new URL is on its way.
  const objectId = `${key}\u0000${version ?? ''}`;
  const [loaded, setLoaded] = useState<{ objectId: string; url: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // The image this tile has already signed a fresh URL for. A ref: only the
  // error handler reads it, and nothing on screen depends on it.
  const renewedFor = useRef<string | null>(null);

  // Above the early returns below, so this component calls the same hooks on
  // every render. It used to sit after them, which changed the hook count the
  // moment authentication finished.
  useEffect(() => {
    if (!apiS3 || !wantsImage || !key) return;

    let cancelled = false;
    thumbnailUrlFor(apiS3, { key, version }).then(
      (url) => {
        if (!cancelled) setLoaded({ objectId, url });
      },
      (error) => {
        // The icon stands in, as for any file without a picture.
        console.error('Error loading image preview:', error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [apiS3, wantsImage, key, version, objectId]);

  /**
   * The image would not load. The icon stands in, and the first time, a fresh
   * URL is signed and tried: the image loads only once the tile is scrolled
   * into view, by which time the URL it was handed may have expired. Nothing
   * signed a new one, so the tile kept its icon until it was mounted again.
   *
   * Once per image. One that fails on a fresh URL too is not an expired URL's
   * doing, and trying again would only fail again.
   */
  const handleImageError = (failed: string) => {
    setFailedUrl(failed);
    if (!apiS3 || !key || renewedFor.current === objectId) return;
    renewedFor.current = objectId;

    forgetThumbnailUrl(apiS3, { key, version }, failed);
    const forObject = objectId;
    thumbnailUrlFor(apiS3, { key, version }).then(
      // Only over the URL that failed: by now the tile may be showing
      // another file, which its own URL belongs to.
      (fresh) =>
        setLoaded((current) =>
          current?.url === failed ? { objectId: forObject, url: fresh } : current
        ),
      (error) => console.error('Error loading image preview:', error)
    );
  };

  if (isLoading) {
    return <PreviewLoading message="Authenticating..." />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  const url = wantsImage && loaded?.objectId === objectId ? loaded.url : null;

  if (url && url !== failedUrl) {
    return (
      <div
        className={`${className} ${getFileBackground(extension)} border-b border-border/50 overflow-hidden relative`}
      >
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => handleImageError(url)}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} ${getFileBackground(extension)} flex items-center justify-center border-b border-border/50`}
    >
      <FileIconLarge extension={extension} filename={filename} className="h-16 w-16" />
    </div>
  );
}
