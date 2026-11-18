import { getPageMap } from 'nextra/page-map';
import { normalizePages } from 'nextra/normalize-pages';
import { DOCS_URL } from './site';
import { breadcrumbTrail, type TrailItem } from './breadcrumb-trail';

/**
 * JSON-LD for the docs: a BreadcrumbList on every page below the home, and a
 * WebSite naming the site on the home.
 */

/** The BreadcrumbList for a page, or null where there is no trail to show. */
export async function breadcrumbJsonLd(segments: readonly string[] = []) {
  const route = `/${segments.filter(Boolean).join('/')}`;
  if (route === '/') return null;

  const { activePath } = normalizePages({ list: await getPageMap(), route });
  const crumbs = breadcrumbTrail(activePath as TrailItem[]);
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
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
