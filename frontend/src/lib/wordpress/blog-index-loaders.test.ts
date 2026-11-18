/**
 * The blog's loaders: what they return when WordPress answers, has nothing,
 * or cannot be reached, and how long they ask for the answer to be cached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRecentPosts = vi.fn();
let blogEnabled = true;

vi.mock('./service', () => ({
  getRecentPosts: (...args: unknown[]) => getRecentPosts(...args),
}));
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => blogEnabled,
  requiresWordPressCredentials: () => blogEnabled,
}));

import { FEED_REVALIDATE_SECONDS, loadFeedPosts } from './blog-index';
import { revalidate as feedRouteRevalidate } from '@/app/blog/rss.xml/route';

beforeEach(() => {
  getRecentPosts.mockReset();
  blogEnabled = true;
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://wp.example.test/graphql');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadFeedPosts', () => {
  it('returns the posts WordPress gives', async () => {
    getRecentPosts.mockResolvedValue([{ slug: 'a' }]);
    expect(await loadFeedPosts()).toEqual([{ slug: 'a' }]);
  });

  it('returns null, not an empty list, when WordPress cannot be reached', async () => {
    getRecentPosts.mockRejectedValue(new Error('ETIMEDOUT'));
    expect(await loadFeedPosts()).toBeNull();
  });

  it('returns an empty list when no WordPress is configured, which is known, not unknown', async () => {
    // A blog with no source has nothing to show and stays out of search; only
    // a configured WordPress that fails to answer is treated as unknown.
    vi.stubEnv('WORDPRESS_GRAPHQL_URL', '');
    expect(await loadFeedPosts()).toEqual([]);
    expect(getRecentPosts).not.toHaveBeenCalled();
  });

  it('returns an empty list when the blog is turned off, without asking WordPress', async () => {
    blogEnabled = false;
    expect(await loadFeedPosts()).toEqual([]);
    expect(getRecentPosts).not.toHaveBeenCalled();
  });

  it('asks for the answer to be cached as long as the feed is', async () => {
    // A route is regenerated as often as its shortest-lived fetch, so the
    // feed's hour has to reach the WordPress fetch too.
    getRecentPosts.mockResolvedValue([]);
    await loadFeedPosts();

    expect(getRecentPosts).toHaveBeenCalledWith(expect.any(Number), {
      revalidate: FEED_REVALIDATE_SECONDS,
    });
    expect(feedRouteRevalidate).toBe(FEED_REVALIDATE_SECONDS);
  });
});
