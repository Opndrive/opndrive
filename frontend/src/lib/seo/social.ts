import type { Metadata } from 'next';
import { SEO_CONFIG } from './config';

/**
 * The link-preview fields every page shares, and a builder for a page's own.
 *
 * Next.js does not merge `openGraph` or `twitter` across segments: a page that
 * sets either replaces the layout's outright. That is how the /connect pages
 * lost their share image - they set an og:title, so the layout's og:image went
 * with it - and how /connect ended up with the home page's Twitter title. So
 * every page that sets its own spreads these rather than starting from blank.
 *
 * The values come from SEO_CONFIG, the one place the site name and share image
 * are set.
 */

export interface ShareImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export const SHARE_IMAGE: ShareImage = {
  url: SEO_CONFIG.ogImage,
  width: SEO_CONFIG.ogImageWidth,
  height: SEO_CONFIG.ogImageHeight,
  alt: 'Opndrive - S3 Storage Interface',
};

export const BASE_OPEN_GRAPH = {
  siteName: SEO_CONFIG.siteName,
  locale: 'en_US',
  // A literal, as Metadata requires; a test keeps it equal to SEO_CONFIG.ogType.
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
 * `path` is relative; the layout's metadataBase makes it absolute. `image`
 * replaces the site's share image for a page that has its own (the blog).
 */
export function pageSocialMetadata({
  title,
  description,
  path,
  image = SHARE_IMAGE,
}: {
  title: string;
  description: string;
  path: string;
  image?: ShareImage;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: { ...BASE_OPEN_GRAPH, images: [image], title, description, url: path },
    twitter: { ...BASE_TWITTER, images: [image.url], title, description },
  };
}
