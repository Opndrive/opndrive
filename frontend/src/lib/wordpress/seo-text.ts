/**
 * What search engines are shown for a post, an author and a topic: titles,
 * descriptions, author links and which topics get a page of their own.
 *
 * The posts' search title and description are written in Yoast, in
 * WordPress. These turn what WPGraphQL returns into what the page sends, with
 * a sensible answer for posts written by hand that never set them.
 */

/** Our name, as search results and the Open Graph site name show it. */
export const SITE_NAME = 'Opndrive';

/** Under this, a description built from an excerpt is not cut by Google. */
export const DESCRIPTION_MAX = 160;

/** A topic gets a hub page once it holds this many published posts. */
export const HUB_MIN_POSTS = 3;

/** WordPress's catch-all category, which is not a topic. */
const NOT_A_TOPIC = new Set(['uncategorized']);

/** The separators Yoast offers for its title templates. */
const SEPARATORS = '-–—|·•*~«»<>:';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The title search engines should see.
 *
 * Yoast's `seo.title` is the custom SEO title when an editor set one, and
 * otherwise a title built from Yoast's template: "Post title - Site name",
 * where the site name is WordPress's own, which need not be ours. That
 * ending is removed, so a post written by hand shows its own title rather than
 * another site's name. Nothing is added: Google shows the site name beside the
 * title on its own, from the Open Graph and WebSite data.
 */
export function searchTitle(
  seoTitle: string | null | undefined,
  postTitle: string,
  wordpressSiteName?: string | null
): string {
  let title = (seoTitle ?? '').trim();
  if (!title) return postTitle;

  for (const name of [wordpressSiteName, SITE_NAME]) {
    const trimmed = name?.trim();
    if (!trimmed) continue;

    const suffix = new RegExp(
      `\\s*[${escapeRegExp(SEPARATORS)}]\\s*${escapeRegExp(trimmed)}\\s*$`,
      'i'
    );
    const stripped = title.replace(suffix, '').trim();
    if (stripped && stripped !== title) {
      title = stripped;
      break;
    }
  }

  return title || postTitle;
}

/**
 * A description from text with no description of its own: an excerpt or a
 * category description. Cut at the last word that fits under 160 characters,
 * with no "..." added. WordPress's own "[…]" at the end of an excerpt goes too.
 */
export function descriptionFromText(text: string | null | undefined): string {
  const clean = (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*(\[(…|&hellip;|\.\.\.)\]|…)\s*$/u, '')
    .trim();

  const chars = Array.from(clean);
  if (chars.length < DESCRIPTION_MAX) return clean;

  const head = chars.slice(0, DESCRIPTION_MAX - 1).join('');
  // The cut lands inside a word unless the next character is a space.
  const atWord = chars[DESCRIPTION_MAX - 1] === ' ' ? head : head.replace(/\s+\S*$/, '');
  // A word of 159 characters has nowhere to stop: keep what fits.
  return (atWord || head).replace(/[\s,;:–—-]+$/u, '');
}

/** The social profiles Yoast keeps on a WordPress user. */
export interface AuthorSocial {
  twitter?: string | null;
  linkedIn?: string | null;
  facebook?: string | null;
  youTube?: string | null;
  wikipedia?: string | null;
  instagram?: string | null;
}

function webUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The author's own pages elsewhere, for `sameAs`: their website, and the
 * profiles filled in under Yoast's "Contact info". Yoast keeps the X profile
 * as a bare username; the rest are addresses. Anything that is not a web
 * address is left out.
 */
export function authorSameAs(
  website: string | null | undefined,
  social: AuthorSocial | null | undefined
): string[] {
  const twitter = social?.twitter?.trim().replace(/^@/, '');
  const candidates = [
    website,
    twitter && !/^https?:\/\//i.test(twitter) ? `https://x.com/${twitter}` : twitter,
    social?.linkedIn,
    social?.facebook,
    social?.youTube,
    social?.wikipedia,
    social?.instagram,
  ];

  const links = candidates.map(webUrl).filter((link): link is string => link !== null);
  return Array.from(new Set(links));
}

/** Where an author's profile lives on this site. */
export function authorPath(slug: string): string {
  return `/blog/author/${slug}`;
}

/** Where a topic's hub lives on this site. */
export function hubPath(slug: string): string {
  return `/blog/category/${slug}`;
}

/** Whether a category is a topic with enough published posts for a hub. */
export function hasHub(category: { slug: string; count?: number | null }): boolean {
  return !NOT_A_TOPIC.has(category.slug) && (category.count ?? 0) >= HUB_MIN_POSTS;
}

/**
 * The hub a post belongs to, for its breadcrumb: the first of its categories
 * that has one, or none.
 */
export function hubFor<T extends { slug: string; count?: number | null }>(
  categories: readonly T[]
): T | null {
  return categories.find(hasHub) ?? null;
}
