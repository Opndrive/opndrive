import { getPageMap } from 'nextra/page-map';
import { normalizePages } from 'nextra/normalize-pages';
import { DOCS_URL } from './links';
import { isHomePage, pageUrl } from './site';
import { breadcrumbTrail, type TrailItem } from './breadcrumb-trail';

/**
 * JSON-LD for the docs: a BreadcrumbList on every page below the home, and a
 * WebSite naming the site on the home.
 */

interface PageMapNode {
  route?: string;
  frontMatter?: unknown;
  children?: PageMapNode[];
}

/** Every page's URL, from the page map: an entry with frontmatter is a page. */
function pageUrls(nodes: readonly PageMapNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if ('frontMatter' in node && node.route) into.add(pageUrl(node.route.split('/')));
    if (node.children) pageUrls(node.children, into);
  }
  return into;
}

/**
 * The BreadcrumbList for a page, or null where there is no trail to show.
 *
 * Every crumb's URL is checked against the real pages, and a miss fails the
 * build. breadcrumbTrail mirrors Nextra's breadcrumb rather than calling it,
 * so a Nextra upgrade that changes how sections link would otherwise ship
 * structured data pointing at pages that do not exist, with nothing to notice.
 */
export async function breadcrumbJsonLd(segments: readonly string[] = []) {
  if (isHomePage(segments)) return null;

  const route = `/${segments.filter(Boolean).join('/')}`;
  const pageMap = await getPageMap();
  const { activePath } = normalizePages({ list: pageMap, route });
  const crumbs = breadcrumbTrail(activePath as TrailItem[]);
  // Google needs at least two crumbs for a breadcrumb rich result.
  if (crumbs.length < 2) return null;

  const pages = pageUrls(pageMap as PageMapNode[]);
  for (const crumb of crumbs.slice(1)) {
    if (!pages.has(crumb.url)) {
      throw new Error(
        `Breadcrumb "${crumb.name}" on ${route} points at ${crumb.url}, which is not a page. ` +
          "breadcrumbTrail (docs/lib/breadcrumb-trail.ts) no longer matches Nextra's breadcrumb."
      );
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/** The docs site's name, for Google's site names, on the home page only. */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Opndrive Docs',
    url: `${DOCS_URL}/`,
  };
}

/**
 * JSON for an inline <script>. "<" is escaped so no value can close the
 * script element early.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
