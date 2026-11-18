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

/**
 * Twitter card fields every page shares. The image is left to Next.js, which
 * fills twitter:image from openGraph's when it is unset.
 */
export const BASE_TWITTER = {
  card: 'summary_large_image',
  // The same handle the main site uses, from frontend/src/lib/seo/config.ts.
  site: '@opndrive',
} satisfies Metadata['twitter'];

/**
 * The page a request's segments reach, as decoded route segments.
 *
 * Nextra's importPage decodes the joined path before it looks the page up, so
 * `/guides/uploading%2Dfiles` and even `/guides%2Fuploading-files` reach
 * `/guides/uploading-files`. Decoding the same way here (the whole path, then
 * splitting) gives every spelling the one route. Nextra hands the home page
 * over as `['']`, and Next.js as no segments at all, so empty segments go.
 */
export function pageSegments(segments: readonly string[] = []): string[] {
  const joined = segments.join('/');
  let decoded = joined;
  try {
    decoded = decodeURIComponent(joined);
  } catch {
    // Not valid percent-encoding: the path as written.
  }
  return decoded.split('/').filter(Boolean);
}

/** The route Nextra knows a page by: `/guides/uploading-files`, or `/`. */
export function pageRoute(segments?: readonly string[]): string {
  return `/${pageSegments(segments).join('/')}`;
}

/**
 * A decoded segment as it goes into a URL: what a path cannot carry is
 * percent-encoded, and what it can (letters, `-`, `+`, `@`, `:` and the like)
 * is left as Nextra's own links write it, so the canonical matches them. The
 * exceptions are the characters XML gives meaning to (`&`, `'`): Next.js writes
 * sitemap URLs into <loc> unescaped, so a raw `&` would make the whole sitemap
 * malformed XML.
 */
const RESERVED_IN_SEGMENT: Record<string, string> = {
  '#': '%23',
  '?': '%3F',
  '&': '%26',
  "'": '%27',
};

function encodeSegment(segment: string): string {
  // encodeURI leaves all four alone (and encodeURIComponent leaves `'`).
  return encodeURI(segment).replace(/[#?&']/g, (ch) => RESERVED_IN_SEGMENT[ch]!);
}

/**
 * Absolute URL for a page, from the catch-all route's `mdxPath` segments.
 *
 * Home becomes the bare origin, which is the form Next.js writes for a root
 * canonical. Nothing gets a trailing slash, matching the 308 the site already
 * answers `/foo/` with. Every spelling of a path that reaches the same page
 * names the same URL (see pageSegments), and a file name with a space or `#`
 * still gives a valid URL in the canonical tag and the sitemap.
 */
export function pageUrl(segments: readonly string[] = []): string {
  const path = pageSegments(segments).map(encodeSegment).join('/');
  return path ? `${DOCS_URL}/${path}` : DOCS_URL;
}

/**
 * A page's metadata as Nextra gives it: its frontmatter, with a plain-string
 * title. Written out rather than taken from Nextra's own type so this module
 * stays free of Nextra imports, which is what lets the frontend suite test it.
 */
type PageOwnMetadata = Omit<Metadata, 'title'> & { title?: string };

/**
 * A page's metadata with the site's added: its canonical URL, `og:url` and the
 * shared Open Graph fields.
 *
 * Whatever the page sets itself in frontmatter is kept. Its own `openGraph`
 * image or description wins over the shared one, its own `twitter` fields go
 * on top of the shared card and handle, and its own `alternates` (languages,
 * say) stay beside the canonical. The canonical and `og:url` are always this
 * page's.
 */
export function pageMetadata(own: PageOwnMetadata, segments?: readonly string[]): Metadata {
  const url = pageUrl(segments);
  const isHome = url === DOCS_URL;

  return {
    ...own,
    // The home page's own title already names the product, so the layout's
    // "%s - Opndrive Docs" template would only say it twice.
    ...(isHome && own.title !== undefined && { title: { absolute: own.title } }),
    alternates: { ...own.alternates, canonical: url },
    // Restates the shared fields: setting openGraph here replaces the
    // layout's rather than adding to it.
    openGraph: { ...BASE_OPEN_GRAPH, ...own.openGraph, url },
    // Set here because a page's own twitter would otherwise replace the
    // layout's outright, card and handle with it.
    twitter: { ...BASE_TWITTER, ...own.twitter },
  };
}
