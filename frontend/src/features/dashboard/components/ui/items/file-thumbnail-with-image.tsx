import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileIconLarge } from '@/shared/components/icons/file-icons';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
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
import { useOnScreen } from '@/hooks/use-on-screen';
import { requestImageSlot } from '@/services/image-slots';

interface FileThumbnailWithImageProps {
  extension: FileExtension;
  filename?: string;
  name: string;
  file?: FileItem;
  className?: string;
}

/**
 * How long to wait before signing again when the fresh URL came out the same
 * as the one that failed. A presigned URL carries the second it was signed
 * in, so one signed again within that second is the same URL.
 */
const RESIGN_AFTER_MS = 1000;

/** A URL for the image other than `failed`, which would not load. */
async function freshThumbnailUrl(
  apiS3: BYOS3ApiProvider,
  object: { key: string; version?: string },
  failed: string
): Promise<string> {
  forgetThumbnailUrl(apiS3, object, failed);
  const fresh = await thumbnailUrlFor(apiS3, object);
  if (fresh !== failed) return fresh;

  await new Promise((resolve) => setTimeout(resolve, RESIGN_AFTER_MS));
  forgetThumbnailUrl(apiS3, object, fresh);
  return thumbnailUrlFor(apiS3, object);
}

/**
 * A grid tile's picture: the image itself when it is small enough to fetch
 * for a tile, its file icon otherwise.
 *
 * Only for a tile on screen, and only a few at a time. A virtualized grid
 * draws cards a few rows beyond what is visible, and a fling across a big
 * folder draws and drops a screenful at a time; fetching for every card drawn
 * spent the connection on images nobody saw. So the image waits until the
 * tile is actually visible and a loading slot is free, and a tile that leaves
 * the screen before its image arrives gives the slot back and stops the
 * download. One that has its image keeps it.
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

  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(box);
  // The URL whose image has finished loading here, so it stays shown when the
  // tile is scrolled off and back, with nothing left to fetch.
  const [shown, setShown] = useState<string | null>(null);
  // The URL that holds a loading slot.
  const [slotFor, setSlotFor] = useState<string | null>(null);

  // Above the early returns below, so this component calls the same hooks on
  // every render. It used to sit after them, which changed the hook count the
  // moment authentication finished.
  useEffect(() => {
    if (!apiS3 || !wantsImage || !key || !onScreen) return;

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
  }, [apiS3, wantsImage, key, version, objectId, onScreen]);

  const signed = wantsImage && loaded?.objectId === objectId ? loaded.url : null;
  const usable = signed && signed !== failedUrl ? signed : null;
  const done = usable !== null && shown === usable;

  /**
   * A slot while the image is wanted and not yet loaded: on screen, with a URL.
   * Losing either - scrolled away, unmounted, loaded, failed - gives it back,
   * or leaves the queue if it never got one.
   */
  const wantsSlot = usable !== null && !done && onScreen;
  useEffect(() => {
    if (!wantsSlot || !usable) return;
    const release = requestImageSlot(() => setSlotFor(usable));
    return () => {
      release();
      setSlotFor((current) => (current === usable ? null : current));
    };
  }, [wantsSlot, usable]);

  /**
   * Stops a download the tile no longer wants. An `<img>` taken out of the DOM
   * mid-download goes on downloading; clearing its `src` first is what stops
   * the request.
   */
  const image = useRef<HTMLImageElement | null>(null);
  const setImage = useCallback((element: HTMLImageElement | null) => {
    const previous = image.current;
    if (!element && previous && !previous.complete) previous.removeAttribute('src');
    image.current = element;
  }, []);

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

    const forObject = objectId;
    freshThumbnailUrl(apiS3, { key, version }, failed).then(
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

  // The image once it has loaded, or while it holds a slot to load; the icon
  // otherwise. One box either way, so the tile is observed as one element.
  const url = usable !== null && (done || slotFor === usable) ? usable : null;

  return (
    <div
      ref={setBox}
      className={`${className} ${getFileBackground(extension)} relative flex items-center justify-center overflow-hidden border-b border-border/50`}
    >
      {url ? (
        <img
          ref={setImage}
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          onLoad={() => setShown(url)}
          onError={() => handleImageError(url)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <FileIconLarge extension={extension} filename={filename} className="h-16 w-16" />
      )}
    </div>
  );
}
