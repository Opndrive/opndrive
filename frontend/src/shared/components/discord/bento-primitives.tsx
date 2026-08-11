'use client';

import { cn } from '@/shared/utils/utils';

/**
 * Decorative emoji art for the Bento tiles.
 *
 * Each entry points at a 256x256 transparent SVG in `public/discord-bento/`.
 * They are rendered as CSS background images, deliberately oversized and bled
 * past a tile corner so they read as ambient art rather than inline icons.
 * Because they are backgrounds, a missing file degrades to nothing at all - no
 * broken-image glyph.
 */
export const BENTO_EMOJI = {
  hangouts: '/discord-bento/hangouts.svg',
  reviews: '/discord-bento/reviews.svg',
  debugging: '/discord-bento/debugging.svg',
  builders: '/discord-bento/builders.svg',
} as const;

/**
 * Placeholder member avatars. Illustrations rather than real members, kept as
 * files so no portrait hex codes leak into component styling.
 */
export const BUILDER_AVATARS = [
  '/discord-bento/builder-1.svg',
  '/discord-bento/builder-2.svg',
  '/discord-bento/builder-3.svg',
  '/discord-bento/builder-4.svg',
] as const;

/** Fine-grained noise, inlined as SVG so tiles need no image assets. */
const NOISE_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Shared tile chrome. Colours come from the globals.css design tokens, so tiles
 * track the active theme instead of pinning themselves to a dark palette:
 * `secondary` sits just off `card` in both themes, giving them a readable edge
 * against their container.
 */
export const TILE_BASE =
  'group/tile relative overflow-hidden rounded-2xl border border-border bg-secondary/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20';

export function CornerEmoji({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Sits behind the tile's content, which is `relative` and so paints on top.
        'pointer-events-none absolute select-none bg-contain bg-center bg-no-repeat opacity-80',
        'transition-transform duration-300 group-hover/tile:scale-110',
        className
      )}
      style={{ backgroundImage: `url('${src}')` }}
    />
  );
}

/** Soft-light keeps the grain subtle on light and dark surfaces alike. */
export function Noise({ opacity = 0.35 }: { opacity?: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 mix-blend-soft-light"
      style={{ backgroundImage: NOISE_TEXTURE, opacity }}
    />
  );
}

/** The stacked member avatars, shared by the Bento tile and the landing CTA. */
export function BuilderAvatars({ className }: { className?: string }) {
  return (
    <div className={cn('flex -space-x-2', className)}>
      {BUILDER_AVATARS.map((src, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-5 w-5 rounded-full bg-secondary bg-cover bg-center ring-[1.5px] ring-card"
          style={{ backgroundImage: `url('${src}')` }}
        />
      ))}
    </div>
  );
}

/** The pulsing "we meet on Wednesdays" badge. */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-community-live/30 bg-community-live/10 px-2 py-0.5',
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-community-live opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-community-live" />
      </span>
      <span className="whitespace-nowrap text-[10px] font-medium text-community-live">
        Every Wed @ 5 PM UTC
      </span>
    </div>
  );
}
