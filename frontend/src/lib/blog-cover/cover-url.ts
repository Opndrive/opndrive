/**
 * Where a post's picture comes from: the cover its author set in WordPress,
 * or the one drawn from its title at /blog/<slug>/cover.png.
 *
 * Server and browser safe: no Node APIs here, so cards can import it.
 */

import type { BlogPostSummary } from '@/lib/wordpress/types';

export const GENERATED_COVER_SIZE = { width: 1200, height: 630 } as const;

export interface CoverImage {
  url: string;
  alt: string;
  width: number;
  height: number;
  /** True for the cover drawn from the title, served by this app. */
  generated?: boolean;
}

/**
 * The drawn cover's address. It carries the post's last-modified time, so a
 * changed title is a new address and no cache - the browser's, a CDN's, a
 * social network's - keeps showing the old one.
 */
export function generatedCoverPath(post: Pick<BlogPostSummary, 'slug' | 'modifiedDate'>): string {
  const version = Date.parse(post.modifiedDate);
  const query = Number.isNaN(version) ? '' : `?v=${version.toString(36)}`;
  return `/blog/${post.slug}/cover.png${query}`;
}

export function coverImageFor(
  post: Pick<BlogPostSummary, 'slug' | 'title' | 'modifiedDate' | 'featuredImage'>
): CoverImage {
  if (post.featuredImage) return post.featuredImage;
  return {
    url: generatedCoverPath(post),
    alt: post.title,
    ...GENERATED_COVER_SIZE,
    generated: true,
  };
}
