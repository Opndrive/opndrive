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
import { getRecentPosts } from './service';
import type { BlogPost } from './types';

/** How many posts the blog index asks WordPress for. */
export const BLOG_INDEX_POST_LIMIT = 50;

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

/** The recent posts, or null if a configured WordPress did not answer. */
async function fetchRecentPosts(revalidate?: number): Promise<BlogPost[] | null> {
  // No blog, or no WordPress behind it: nothing to show, which is known.
  if (!isWordPressConfigured()) return [];

  try {
    return await getRecentPosts(BLOG_INDEX_POST_LIMIT, { revalidate });
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
export const loadBlogIndexPosts = cache((): Promise<BlogPost[] | null> => fetchRecentPosts());

/**
 * The posts for the RSS feed, cached as long as the feed is. A minute-long
 * fetch would make the hourly feed regenerate every minute.
 */
export function loadFeedPosts(): Promise<BlogPost[] | null> {
  return fetchRecentPosts(FEED_REVALIDATE_SECONDS);
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
