/**
 * The blog index as readers and crawlers meet it: which address each page
 * answers on, what an empty or a one-post blog shows, and where the call to
 * action goes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { BlogPostSummary } from '@/lib/wordpress/types';

const getPostSummaries = vi.fn();

vi.mock('@/lib/wordpress/service', () => ({
  getPostSummaries: (...args: unknown[]) => getPostSummaries(...args),
}));
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => true,
  requiresWordPressCredentials: () => true,
}));
// The navbar asks GitHub for a star count; nothing here is about it.
vi.mock('@/components/blog/blog-navbar', () => ({ default: () => null }));

import BlogPage, { generateMetadata } from './page';
import config from '../../../next.config';

function summary(n: number): BlogPostSummary {
  return {
    id: `id-${n}`,
    slug: `post-${n}`,
    title: `Post number ${n}`,
    excerpt: `What post ${n} is about.`,
    publishedDate: '2026-11-01T03:30:00Z',
    publishedDateLocal: '2026-11-01T09:00:00',
    modifiedDate: '2026-11-02T04:30:00Z',
    modifiedDateLocal: '2026-11-02T10:00:00',
    author: { name: 'Opndrive' },
    categories: [],
    tags: [],
  };
}

const posts = (count: number) => Array.from({ length: count }, (_, i) => summary(i));

async function renderPage(page?: string | string[]) {
  const ui = await BlogPage({ searchParams: Promise.resolve(page ? { page } : {}) });
  return render(ui);
}

beforeEach(() => {
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://wp.example.test/graphql');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('blog index addresses', () => {
  it.each(['1', 'abc', '0', '02'])(
    'sends ?page=%s to /blog with a permanent redirect',
    async (page) => {
      getPostSummaries.mockResolvedValue(posts(30));

      await expect(BlogPage({ searchParams: Promise.resolve({ page }) })).rejects.toMatchObject({
        digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/blog;308;/),
      });
    }
  );

  it('answers 404 for a page past the last one, instead of an empty page', async () => {
    getPostSummaries.mockResolvedValue(posts(5));

    await expect(BlogPage({ searchParams: Promise.resolve({ page: '2' }) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('gives each page its own canonical address and title', async () => {
    getPostSummaries.mockResolvedValue(posts(30));

    const first = await generateMetadata({ searchParams: Promise.resolve({}) });
    const second = await generateMetadata({ searchParams: Promise.resolve({ page: '2' }) });

    expect(first.alternates?.canonical).toBe('https://opndrive.app/blog');
    expect(second.alternates?.canonical).toBe('https://opndrive.app/blog?page=2');
    expect(String(second.title)).toContain('Page 2');
    expect(String(first.title)).not.toContain('Page');
  });

  it('redirects /blogs, and anything under it, to the blog for good', async () => {
    const redirects = await config.redirects!();

    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/blogs', destination: '/blog', permanent: true },
        { source: '/blogs/:path*', destination: '/blog/:path*', permanent: true },
      ])
    );
  });
});

describe('blog index content', () => {
  it('shows only the featured post when it is the only one, with no "no posts" message', async () => {
    getPostSummaries.mockResolvedValue(posts(1));
    await renderPage();

    expect(screen.getByRole('heading', { name: 'Featured blog post' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Post number 0' })).toBeDefined();
    expect(screen.queryByText(/no (blog )?posts/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: /more posts|all blog posts/i })).toBeNull();
  });

  it('says once that there are no posts yet, under no section headings', async () => {
    getPostSummaries.mockResolvedValue([]);
    await renderPage();

    expect(screen.getAllByText(/no posts yet/i)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Featured blog post' })).toBeNull();
  });

  it('features the newest post on page 1 only', async () => {
    getPostSummaries.mockResolvedValue(posts(25));

    const { unmount } = await renderPage();
    expect(screen.getByRole('heading', { name: 'Featured blog post' })).toBeDefined();
    unmount();

    await renderPage('2');
    expect(screen.queryByRole('heading', { name: 'Featured blog post' })).toBeNull();
    expect(screen.queryByText('Post number 0')).toBeNull();
    expect(screen.getByText('Page 2 of 3')).toBeDefined();
    expect(screen.getByText('Post number 11')).toBeDefined();
  });

  it('links its call to action to /connect, rather than a button that does nothing', async () => {
    getPostSummaries.mockResolvedValue(posts(3));
    await renderPage();

    const cta = screen.getByRole('link', { name: 'Get Started' });
    expect(cta.getAttribute('href')).toBe('/connect');
    expect(within(document.body).queryByRole('button', { name: 'Get Started' })).toBeNull();
  });
});
