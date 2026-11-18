/**
 * What the blog shows search engines, decided from whether it has any posts.
 *
 * An empty blog index is a page that says "No blog posts available yet". Left
 * indexable and listed in the sitemap, it is the kind of page Google may report
 * as a soft 404. So until WordPress returns a post, /blog is noindex and absent
 * from the sitemap, and the first published post flips both on its own - no
 * environment change, no deploy.
 */

import { cache } from 'react';
import type { Metadata, MetadataRoute } from 'next';
import { isBlogEnabled } from '@/config/features';
import { getRecentPosts } from './service';
import type { BlogPost } from './types';

/** How many posts the blog index asks WordPress for. */
export const BLOG_INDEX_POST_LIMIT = 50;

/**
 * The posts the blog index shows, fetched once per request.
 *
 * generateMetadata needs to know whether there are any, and the page renders
 * them; cache() makes the second call free. A WordPress that is unreachable or
 * not configured reads as no posts, which is what the page already shows in
 * that case.
 */
export const loadBlogIndexPosts = cache(async (): Promise<BlogPost[]> => {
  if (!isBlogEnabled()) return [];

  try {
    return await getRecentPosts(BLOG_INDEX_POST_LIMIT);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }
});

/** The robots rule for /blog given how many posts it has. */
export function blogIndexRobots(postCount: number): NonNullable<Metadata['robots']> {
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
 * every post.
 *
 * Posts carry the date WordPress last modified them, which is a real per-page
 * date and so worth giving Google. The index does not have one of its own, so
 * it carries none rather than a made-up one.
 */
export function blogSitemapEntries(
  posts: ReadonlyArray<Pick<BlogPost, 'slug' | 'modifiedDate'>>,
  siteUrl: string
): MetadataRoute.Sitemap {
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
