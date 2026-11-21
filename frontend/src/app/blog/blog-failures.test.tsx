/**
 * What the blog's pages, feed and sitemap do when a configured WordPress does
 * not answer.
 *
 * At runtime they fail rather than say "nothing here": a 404 or an empty page
 * would tell a crawler the blog or a post is gone, and a cached empty feed or
 * sitemap would stand for an hour, where a thrown error makes Next.js keep the
 * last good one. During `next build` the feed and sitemap fall back instead,
 * so a WordPress outage cannot fail a deploy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPostSummaries = vi.fn();
const getPostBySlug = vi.fn();
const getAllPostSitemapData = vi.fn();

vi.mock('@/lib/wordpress/service', () => ({
  getPostSummaries: (...args: unknown[]) => getPostSummaries(...args),
  getPostBySlug: (...args: unknown[]) => getPostBySlug(...args),
  getAllPostSitemapData: (...args: unknown[]) => getAllPostSitemapData(...args),
  getRelatedPosts: async () => [],
}));
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => true,
  requiresWordPressCredentials: () => true,
}));

import BlogPage from './page';
import BlogPostPage from './[slug]/page';
import { GET as feed } from './rss.xml/route';
import sitemap from '../sitemap';

const unreachable = new Error('ETIMEDOUT');

beforeEach(() => {
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://wp.example.test/graphql');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getPostSummaries.mockRejectedValue(unreachable);
  getPostBySlug.mockRejectedValue(unreachable);
  getAllPostSitemapData.mockRejectedValue(unreachable);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('a configured WordPress that does not answer, at runtime', () => {
  it('fails a post page instead of answering 404 for a live post', async () => {
    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: 'configure-cors-for-r2' }) })
    ).rejects.toBe(unreachable);
  });

  it('still answers 404 for a post WordPress says does not exist', async () => {
    getPostBySlug.mockResolvedValue(null);
    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: 'no-such-post' }) })
    ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });

  it('fails the blog index instead of serving an indexable page with no posts', async () => {
    await expect(BlogPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      /WordPress did not answer/
    );
  });

  it('fails the feed, so the last one built keeps being served', async () => {
    await expect(feed()).rejects.toThrow(/keeping the last feed/);
  });

  it('fails the sitemap, so the last one built keeps being served', async () => {
    await expect(sitemap()).rejects.toBe(unreachable);
  });
});

describe('a configured WordPress that does not answer, during next build', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
  });

  it('builds an empty, valid feed rather than failing the build', async () => {
    const response = await feed();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
  });

  it('builds the sitemap with the blog index kept, rather than failing the build', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://opndrive.app/blog');
  });
});

describe('no WordPress configured at all', () => {
  it('answers 404 for any post, without asking for one', async () => {
    vi.stubEnv('WORDPRESS_GRAPHQL_URL', '');
    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: 'anything' }) })
    ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    expect(getPostBySlug).not.toHaveBeenCalled();
  });

  it('leaves the blog out of the sitemap, which is known, not unknown', async () => {
    vi.stubEnv('WORDPRESS_GRAPHQL_URL', '');
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls.some((url) => url.includes('/blog'))).toBe(false);
    expect(getAllPostSitemapData).not.toHaveBeenCalled();
  });
});
