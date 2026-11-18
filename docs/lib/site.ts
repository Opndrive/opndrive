import type { Metadata } from 'next';
import { DOCS_URL } from './links';

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

/** A segment as written in the URL, or as is if it is not valid percent-encoding. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Absolute URL for a page, from the catch-all route's `mdxPath` segments.
 *
 * Nextra hands the home page over as `['']`, and Next.js as no segments at
 * all, so empty segments are dropped. Home becomes the bare origin, which is
 * the form Next.js writes for a root canonical. Nothing gets a trailing slash,
 * matching the 308 the site already answers `/foo/` with.
 *
 * Each segment is decoded and then encoded again, so every spelling of a path
 * that reaches the same page (Nextra's importPage decodes before it looks the
 * page up: `/guides/uploading%2Dfiles` is `/guides/uploading-files`) names one
 * canonical URL, and a file name with a space or `#` still gives a valid URL in
 * the canonical tag and the sitemap.
 */
export function pageUrl(segments: readonly string[] = []): string {
  const path = segments
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeSegment(segment)))
    .join('/');
  return path ? `${DOCS_URL}/${path}` : DOCS_URL;
}

/**
 * Whether these segments are the docs home. The one test for it: page
 * metadata, the structured data choice and the breadcrumb guard all use it.
 */
export function isHomePage(segments?: readonly string[]): boolean {
  return pageUrl(segments) === DOCS_URL;
}

/** A page's metadata as Nextra gives it: its frontmatter, with a plain-string title. */
type PageOwnMetadata = Omit<Metadata, 'title'> & { title?: string };

/**
 * A page's metadata with the site's added: its canonical URL, `og:url` and the
 * shared Open Graph fields.
 *
 * Whatever the page sets itself in frontmatter is kept. Its own `openGraph`
 * image or description wins over the shared one, and its own `alternates`
 * (languages, say) stay beside the canonical. The canonical and `og:url` are
 * always this page's.
 */
export function pageMetadata(own: PageOwnMetadata, segments?: readonly string[]): Metadata {
  const url = pageUrl(segments);
  const isHome = isHomePage(segments);

  return {
    ...own,
    // The home page's own title already names the product, so the layout's
    // "%s - Opndrive Docs" template would only say it twice.
    ...(isHome && own.title !== undefined && { title: { absolute: own.title } }),
    alternates: { ...own.alternates, canonical: url },
    // Restates the shared fields: setting openGraph here replaces the
    // layout's rather than adding to it.
    openGraph: { ...BASE_OPEN_GRAPH, ...own.openGraph, url },
  };
}
