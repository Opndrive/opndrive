import type { Metadata } from 'next';

/**
 * The docs site's public origin.
 *
 * Deliberately not read from the environment. Canonical URLs and the sitemap
 * have to name production even when served from a preview deployment, or a
 * search engine would be told the preview is the real page.
 */
export const DOCS_URL = 'https://docs.opndrive.app';

/**
 * Open Graph fields every page shares.
 *
 * Next.js does not merge `openGraph` across segments: a page that sets its own
 * replaces the layout's outright, image and all. So the layout and the page
 * route both spread this and add only what is theirs.
 */
export const BASE_OPEN_GRAPH = {
  siteName: 'Opndrive Docs',
  type: 'website',
  locale: 'en_US',
  images: ['/og-image.png'],
} satisfies Metadata['openGraph'];

/**
 * Absolute URL for a page, from the catch-all route's `mdxPath` segments.
 *
 * Nextra hands the home page over as `['']`, and Next.js as no segments at
 * all, so empty segments are dropped. Home becomes the bare origin, which is
 * the form Next.js writes for a root canonical. Nothing gets a trailing slash,
 * matching the 308 the site already answers `/foo/` with.
 */
export function pageUrl(segments: readonly string[] = []): string {
  const path = segments.filter(Boolean).join('/');
  return path ? `${DOCS_URL}/${path}` : DOCS_URL;
}
