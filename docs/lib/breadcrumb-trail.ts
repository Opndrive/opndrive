import { DOCS_URL } from './links';
import { pageUrl } from './site';

/**
 * The breadcrumb trail for a docs page, kept apart from structured-data.ts so
 * it can be tested without Nextra's build-time modules.
 */

export interface Crumb {
  name: string;
  url: string;
}

export interface TrailItem {
  route: string;
  title?: unknown;
  frontMatter?: unknown;
  children?: Array<{ route: string }>;
}

/**
 * The text of a title as Nextra allows it to be written in _meta files: a
 * string, or a React node (an element, a fragment, an array) whose text is in
 * its children. Nextra's own breadcrumb flattens it the same way; String()
 * would give "[object Object]".
 */
export function titleText(title: unknown): string {
  if (title === null || title === undefined || typeof title === 'boolean') return '';
  if (typeof title === 'string' || typeof title === 'number') return String(title);
  if (Array.isArray(title)) return title.map(titleText).join('');
  if (typeof title === 'object' && 'props' in title) {
    const props = (title as { props?: { children?: unknown } }).props;
    return titleText(props?.children);
  }
  return '';
}

/**
 * The breadcrumb trail for a route, built the way Nextra's own breadcrumb is.
 *
 * Nextra's activePath holds the section folders and the page. A section has
 * no page of its own, so Nextra links it to its first page - and leaves it
 * unlinked when that first page is the current one. Structured data needs a
 * URL for every crumb but the last, so in that one case the section is left
 * out rather than given the current page's own URL twice. The docs home leads
 * every trail.
 *
 * This mirrors Nextra's component rather than calling it, so it could drift
 * on a Nextra upgrade; structured-data.ts checks every URL it produces
 * against the real pages at build time, which turns any drift into a failed
 * build instead of wrong structured data.
 */
export function breadcrumbTrail(activePath: readonly TrailItem[]): Crumb[] {
  const crumbs: Crumb[] = [{ name: 'Opndrive Docs', url: DOCS_URL }];

  activePath.forEach((item, index) => {
    const next = activePath[index + 1];
    const isPage = 'frontMatter' in item;
    const route = !next || isPage ? item.route : item.children?.[0]?.route;
    if (!route || (next && route === next.route)) return;

    crumbs.push({ name: titleText(item.title), url: pageUrl(route.split('/')) });
  });

  return crumbs;
}
