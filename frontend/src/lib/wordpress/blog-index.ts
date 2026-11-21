/**
 * What the blog shows search engines, decided from whether it has any posts.
 *
 * An empty blog index is a page that says "No blog posts available yet". Left
 * indexable and listed in the sitemap, it is the kind of page Google may report
 * as a soft 404. So until WordPress returns a post, /blog is noindex and absent
 * from the sitemap, and the first published post flips both on its own - no
 * environment change, no deploy.
 *
 * "No posts" has to mean WordPress said so, or that there is no WordPress to
 * ask. A request to a configured WordPress that fails says nothing about the
 * blog, so it reads as unknown (null) and leaves /blog indexable and listed:
 * one timeout while Googlebot is crawling must not deindex a blog that has
 * posts.
 */

import { cache } from 'react';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { Metadata, MetadataRoute } from 'next';
import { isWordPressConfigured } from './client';
import { getPostSummaries } from './service';
import type { BlogPost, BlogPostSummary } from './types';

/**
 * How many posts the blog index asks WordPress for: all of them, in practice.
 *
 * It used to be 50, with the body of every post, so the 51st post and every
 * one after it had no page on the index linking to it. Summaries carry no body,
 * so asking for everything costs a few kilobytes per hundred posts. The ceiling
 * is only a guard against a runaway loop; a blog that reaches it will want
 * paging done in WordPress instead.
 */
export const BLOG_INDEX_POST_LIMIT = 1000;

/** How many of the newest posts the RSS feed carries. */
export const FEED_POST_LIMIT = 50;

/** Cards on each page of the blog index, after the featured post on page 1. */
export const POSTS_PER_PAGE = 10;

/** How long the RSS feed's view of WordPress may be cached: the feed's own interval. */
export const FEED_REVALIDATE_SECONDS = 3600;

/**
 * True while `next build` runs. Routes rebuilt in the background (the feed,
 * the sitemap) throw when WordPress does not answer, because Next.js then
 * keeps serving the last version it built; but during the build there is no
 * last version, and a WordPress outage must not fail a deploy, so there they
 * fall back to what they can say without it.
 */
export function isBuilding(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

/** The newest posts, or null if a configured WordPress did not answer. */
async function fetchPostSummaries(
  limit: number,
  revalidate?: number
): Promise<BlogPostSummary[] | null> {
  // No blog, or no WordPress behind it: nothing to show, which is known.
  if (!isWordPressConfigured()) return [];

  try {
    return await getPostSummaries({ limit, revalidate });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return null;
  }
}

/**
 * The posts the blog index shows, fetched once per request: an array, empty
 * if WordPress has none, or null if it could not be reached.
 *
 * generateMetadata needs to know whether there are any, and the page renders
 * them; cache() makes the second call free.
 */
export const loadBlogIndexPosts = cache((): Promise<BlogPostSummary[] | null> =>
  fetchPostSummaries(BLOG_INDEX_POST_LIMIT)
);

/**
 * The posts for the RSS feed, cached as long as the feed is. A minute-long
 * fetch would make the hourly feed regenerate every minute.
 */
export function loadFeedPosts(): Promise<BlogPostSummary[] | null> {
  return fetchPostSummaries(FEED_POST_LIMIT, FEED_REVALIDATE_SECONDS);
}

/**
 * Every post, cached as long as the feed is: for /llms.txt, which lists them
 * all and is rebuilt hourly like the feed.
 */
export function loadAllPostsHourly(): Promise<BlogPostSummary[] | null> {
  return fetchPostSummaries(BLOG_INDEX_POST_LIMIT, FEED_REVALIDATE_SECONDS);
}

/**
 * The `?page=` of a blog index URL, read strictly.
 *
 * `number` for a page past the first, written the one way it should be
 * ("2", not "02" or "2.0"). `1` when there is no parameter. `'canonical'` when
 * the URL names page 1 or something that is not a page at all ("abc", "0",
 * "-1", the parameter twice): the page sends those to /blog rather than
 * showing page 1 under a second address, or an empty "no posts" page that
 * search engines would read as a soft 404.
 */
export function parseBlogPageParam(raw: string | string[] | undefined): number | 'canonical' {
  if (raw === undefined) return 1;
  if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw) || raw === '1') return 'canonical';
  return Number(raw);
}

export interface BlogIndexPage<T> {
  /** The newest post, shown large. Only on page 1. */
  featured: T | null;
  /** The cards on this page. */
  posts: T[];
  /** Pages of cards; 0 when every post fits in the featured slot. */
  totalPages: number;
}

/**
 * The posts on one page of the blog index, or null for a page past the end.
 *
 * Page 1 leads with the newest post as the featured one and follows it with
 * the next POSTS_PER_PAGE as cards. Later pages are cards only: the featured
 * post used to sit at the top of every page, above posts it had nothing to do
 * with. Pages count the cards after the featured post, so page 2 starts where
 * page 1's cards end.
 */
export function paginateBlogIndex<T>(posts: readonly T[], page: number): BlogIndexPage<T> | null {
  const [newest = null, ...rest] = posts;
  const totalPages = Math.ceil(rest.length / POSTS_PER_PAGE);

  if (page !== 1 && page > totalPages) return null;

  const start = (page - 1) * POSTS_PER_PAGE;
  return {
    featured: page === 1 ? newest : null,
    posts: rest.slice(start, start + POSTS_PER_PAGE),
    totalPages,
  };
}

/**
 * The robots rule for /blog given how many posts it has; null when that is
 * unknown, which keeps the page indexable.
 */
export function blogIndexRobots(postCount: number | null): NonNullable<Metadata['robots']> {
  if (postCount === 0) {
    // Still follow: the navigation and footer links are worth crawling.
    return { index: false, follow: true };
  }

  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  };
}

/**
 * Sitemap entries for the blog: none until a post exists, then the index and
 * every post. With `posts` null (WordPress could not be reached) the index
 * stays listed and the posts are left for the next rebuild, rather than the
 * blog vanishing from the sitemap for an hour.
 *
 * Posts carry the date WordPress last modified them, which is a real per-page
 * date and so worth giving Google. The index does not have one of its own, so
 * it carries none rather than a made-up one.
 */
export function blogSitemapEntries(
  posts: ReadonlyArray<Pick<BlogPost, 'slug' | 'modifiedDate'>> | null,
  siteUrl: string
): MetadataRoute.Sitemap {
  if (posts === null) return [{ url: `${siteUrl}/blog` }];
  if (posts.length === 0) return [];

  return [
    { url: `${siteUrl}/blog` },
    ...posts.map((post) => {
      const modified = new Date(post.modifiedDate);

      return {
        url: `${siteUrl}/blog/${post.slug}`,
        ...(Number.isNaN(modified.getTime()) ? {} : { lastModified: modified }),
      };
    }),
  ];
}
