import type { Metadata } from 'next';

/**
 * The link-preview fields every page shares, and a builder for a page's own.
 *
 * Next.js does not merge `openGraph` or `twitter` across segments: a page that
 * sets either replaces the layout's outright. That is how the /connect pages
 * lost their share image - they set an og:title, so the layout's og:image went
 * with it - and how /connect ended up with the home page's Twitter title. So
 * every page that sets its own spreads these rather than starting from blank.
 */

export const SHARE_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Opndrive - S3 Storage Interface',
};

export const BASE_OPEN_GRAPH = {
  siteName: 'Opndrive',
  locale: 'en_US',
  type: 'website',
  images: [SHARE_IMAGE],
} satisfies Metadata['openGraph'];

export const BASE_TWITTER = {
  card: 'summary_large_image',
  images: [SHARE_IMAGE.url],
} satisfies Metadata['twitter'];

/**
 * Open Graph and Twitter card fields for one page.
 *
 * `path` is relative; the layout's metadataBase makes it absolute.
 */
export function pageSocialMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: { ...BASE_OPEN_GRAPH, title, description, url: path },
    twitter: { ...BASE_TWITTER, title, description },
  };
}
