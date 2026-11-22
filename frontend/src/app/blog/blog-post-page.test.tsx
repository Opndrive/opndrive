/**
 * The post page as a reader meets it: the post's own FAQ is not followed by
 * the product FAQ, related posts come from the post already in hand, and the
 * calls to action are links.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BlogPost } from '@/lib/wordpress/types';

const getPostBySlug = vi.fn();
const getRelatedPosts = vi.fn();

vi.mock('@/lib/wordpress/service', () => ({
  getPostBySlug: (...args: unknown[]) => getPostBySlug(...args),
  getRelatedPosts: (...args: unknown[]) => getRelatedPosts(...args),
}));
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => true,
  requiresWordPressCredentials: () => true,
}));
vi.mock('@/components/blog/blog-navbar', () => ({ default: () => null }));

import BlogPostPage from './[slug]/page';

let postCounter = 0;

function post(content: string): BlogPost {
  postCounter += 1;
  return {
    id: `id-${postCounter}`,
    // A fresh slug per test: rendered bodies are remembered per post version.
    slug: `post-${postCounter}`,
    title: 'Fix SignatureDoesNotMatch',
    excerpt: 'Compare headers.',
    content,
    publishedDate: '2026-11-21T03:30:00Z',
    publishedDateLocal: '2026-11-21T09:00:00',
    modifiedDate: '2026-11-21T03:30:00Z',
    author: { name: 'Opndrive' },
    categories: [{ id: 'dGVybTo0', name: 'Troubleshooting', slug: 'troubleshooting' }],
    tags: [],
    seo: { title: 'Fix SignatureDoesNotMatch', description: 'Compare headers.' },
  };
}

async function renderPost(content: string) {
  const current = post(content);
  getPostBySlug.mockResolvedValue(current);
  render(await BlogPostPage({ params: Promise.resolve({ slug: current.slug }) }));
  return current;
}

beforeEach(() => {
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://wp.example.test/graphql');
  getRelatedPosts.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('the post page', () => {
  it('leaves out the product FAQ under a post that has an FAQ of its own', async () => {
    await renderPost('<p>Body.</p><h2 id="faq">FAQ</h2><h3>Can CORS cause it?</h3><p>No.</p>');

    expect(screen.getByRole('heading', { name: 'Can CORS cause it?' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Curious about Opndrive?' })).toBeNull();
  });

  it('keeps the product FAQ under a post without one', async () => {
    await renderPost('<p>Body.</p>');

    expect(screen.getByRole('heading', { name: 'Curious about Opndrive?' })).toBeDefined();
  });

  it('finds related posts from the post it already has, fetching it once', async () => {
    const current = await renderPost('<p>Body.</p>');

    expect(getPostBySlug).toHaveBeenCalledTimes(1);
    expect(getRelatedPosts).toHaveBeenCalledWith(current, 3);
  });

  it('still shows the post when related posts cannot be fetched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getRelatedPosts.mockRejectedValue(new Error('ETIMEDOUT'));

    await renderPost('<p>The body survives.</p>');

    expect(screen.getByText('The body survives.')).toBeDefined();
  });

  it('titles related posts in the theme text colour, which white on a light page was not', async () => {
    const { seo: _seo, content: _content, ...related } = post('');
    getRelatedPosts.mockResolvedValue([
      { ...related, slug: 'another-post', title: 'Another post' },
    ]);

    await renderPost('<p>Body.</p>');

    const heading = screen.getByRole('heading', { name: 'Relevant blog posts' });
    expect(heading.className).toContain('text-foreground');
    expect(heading.className).not.toContain('text-white');
    expect(screen.getByRole('link', { name: 'See all posts' }).className).not.toContain(
      'text-white'
    );
  });

  it('links Get Started to /connect', async () => {
    await renderPost('<p>Body.</p>');

    const links = screen.getAllByRole('link', { name: 'Get Started' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toBe('/connect');
  });
});
