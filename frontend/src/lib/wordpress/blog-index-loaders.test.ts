/**
 * The blog's loaders: what they return when WordPress answers, has nothing,
 * or cannot be reached, and how long they ask for the answer to be cached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPostSummaries = vi.fn();
let blogEnabled = true;

vi.mock('./service', () => ({
  getPostSummaries: (...args: unknown[]) => getPostSummaries(...args),
}));
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => blogEnabled,
  requiresWordPressCredentials: () => blogEnabled,
}));

import {
  BLOG_INDEX_POST_LIMIT,
  FEED_POST_LIMIT,
  FEED_REVALIDATE_SECONDS,
  loadBlogIndexPosts,
  loadFeedPosts,
} from './blog-index';
import { revalidate as feedRouteRevalidate } from '@/app/blog/rss.xml/route';

beforeEach(() => {
  getPostSummaries.mockReset();
  blogEnabled = true;
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://wp.example.test/graphql');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadFeedPosts', () => {
  it('returns the posts WordPress gives', async () => {
    getPostSummaries.mockResolvedValue([{ slug: 'a' }]);
    expect(await loadFeedPosts()).toEqual([{ slug: 'a' }]);
  });

  it('returns null, not an empty list, when WordPress cannot be reached', async () => {
    getPostSummaries.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await loadFeedPosts()).toBeNull();
  });

  it('returns an empty list when no WordPress is configured, which is known, not unknown', async () => {
    // A blog with no source has nothing to show and stays out of search; only
    // a configured WordPress that fails to answer is treated as unknown.
    vi.stubEnv('WORDPRESS_GRAPHQL_URL', '');
    expect(await loadFeedPosts()).toEqual([]);
    expect(getPostSummaries).not.toHaveBeenCalled();
  });

  it('returns an empty list when the blog is turned off, without asking WordPress', async () => {
    blogEnabled = false;
    expect(await loadFeedPosts()).toEqual([]);
    expect(getPostSummaries).not.toHaveBeenCalled();
  });

  it('asks for the answer to be cached as long as the feed is', async () => {
    // A route is regenerated as often as its shortest-lived fetch, so the
    // feed's hour has to reach the WordPress fetch too.
    getPostSummaries.mockResolvedValue([]);
    await loadFeedPosts();

    expect(getPostSummaries).toHaveBeenCalledWith({
      limit: FEED_POST_LIMIT,
      revalidate: FEED_REVALIDATE_SECONDS,
    });
    expect(feedRouteRevalidate).toBe(FEED_REVALIDATE_SECONDS);
  });
});

describe('loadBlogIndexPosts', () => {
  it('asks for every post, so none is left without a page on the index', async () => {
    // It asked for the newest 50, with their bodies, and the 51st post had no
    // index page linking to it.
    getPostSummaries.mockResolvedValue([]);
    await loadBlogIndexPosts();

    expect(getPostSummaries).toHaveBeenCalledWith({ limit: BLOG_INDEX_POST_LIMIT });
    expect(BLOG_INDEX_POST_LIMIT).toBeGreaterThanOrEqual(1000);
  });
});
