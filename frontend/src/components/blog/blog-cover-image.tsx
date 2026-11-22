import Image from 'next/image';
import type { CoverImage } from '@/lib/blog-cover/cover-url';
import { cn } from '@/shared/utils/utils';

/**
 * Covers are drawn as 1200x630 social cards, with the title running close to
 * both edges. A box of any other shape makes `object-cover` crop the picture to
 * fit, and that cut the first letters off every line of the featured post's
 * title. Sizing the box to the picture instead means there is nothing to crop.
 */
export const COVER_ASPECT_RATIO = '1200 / 630';

interface BlogCoverImageProps {
  /** The author's cover, or the one drawn from the title (coverImageFor). */
  image: CoverImage;
  sizes: string;
  /**
   * `intrinsic` takes the shape of the uploaded picture, so a single large
   * cover is never cropped whatever its size. A grid of cards wants every
   * card the same height instead, which is what the default gives.
   */
  shape?: 'card' | 'intrinsic';
  priority?: boolean;
  /** Grow the picture slightly while its enclosing `group` link is hovered. */
  zoomOnHover?: boolean;
  className?: string;
}

export function BlogCoverImage({
  image,
  sizes,
  shape = 'card',
  priority = false,
  zoomOnHover = false,
  className,
}: BlogCoverImageProps) {
  const aspectRatio =
    shape === 'intrinsic' ? `${image.width} / ${image.height}` : COVER_ASPECT_RATIO;

  return (
    <div
      className={cn('relative w-full overflow-hidden bg-muted', className)}
      style={{ aspectRatio }}
    >
      <Image
        src={image.url}
        alt={image.alt}
        fill
        sizes={sizes}
        priority={priority}
        // The drawn cover is already a sized PNG from this app, at an address
        // that changes with the post; the optimiser has nothing to add.
        unoptimized={image.generated}
        className={cn(
          'object-cover',
          // 2%, not the 5% this used to be: the covers keep their text about
          // 3% in from each side, so a larger zoom pushed it off the edge.
          zoomOnHover && 'transition-transform duration-500 group-hover:scale-[1.02]'
        )}
      />
    </div>
  );
}
