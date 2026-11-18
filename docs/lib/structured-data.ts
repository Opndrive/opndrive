import { getPageMap } from 'nextra/page-map';
import { normalizePages } from 'nextra/normalize-pages';
import { DOCS_URL } from './links';
import { pageRoute, pageUrl } from './site';
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
function collectPageUrls(nodes: readonly PageMapNode[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if ('frontMatter' in node && node.route) into.add(pageUrl(node.route.split('/')));
    if (node.children) collectPageUrls(node.children, into);
  }
  return into;
}

/** Built once per page map, not once per page. */
const pageUrlsByMap = new WeakMap<object, Set<string>>();

function pageUrls(pageMap: readonly PageMapNode[]): Set<string> {
  let urls = pageUrlsByMap.get(pageMap);
  if (!urls) {
    urls = collectPageUrls(pageMap, new Set());
    pageUrlsByMap.set(pageMap, urls);
  }
  return urls;
}

/**
 * The BreadcrumbList for a page below the home, or null where there is no
 * trail to show. The page route decides the home (isHomePage) and asks for a
 * WebSite there instead, so this does not check for it again.
 *
 * Every crumb but the docs home must be a real page. breadcrumbTrail mirrors
 * Nextra's breadcrumb, which links a section to its first child even when that
 * child is a folder; such a crumb is left out, with a build warning, rather
 * than published pointing at a URL that is not a page.
 */
export async function breadcrumbJsonLd(segments: readonly string[] = []) {
  // Decoded the way importPage decodes, so every spelling finds its page.
  const route = pageRoute(segments);
  const pageMap = await getPageMap();
  const { activePath } = normalizePages({ list: pageMap, route });
  const pages = pageUrls(pageMap as PageMapNode[]);

  const crumbs = breadcrumbTrail(activePath as TrailItem[]).filter((crumb, index) => {
    if (index === 0 || pages.has(crumb.url)) return true;
    console.warn(
      `Breadcrumb "${crumb.name}" on ${route} points at ${crumb.url}, which is not a page; ` +
        'left out of the BreadcrumbList.'
    );
    return false;
  });
  // Google needs at least two crumbs for a breadcrumb rich result.
  if (crumbs.length < 2) return null;

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
  return (JSON.stringify(data) ?? '').replace(/</g, '\\u003c');
}
