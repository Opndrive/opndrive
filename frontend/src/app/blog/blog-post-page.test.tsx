/**
 * The post page as a reader meets it: the post's own FAQ is not followed by
 * the product FAQ, related posts come from the post already in hand, and the
 * calls to action are links.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The first test renders the whole page cold - every module imported for the
// first time, the highlighter started - which under a full parallel run can
// pass the default 5 s. Later tests take a fraction of that.
vi.setConfig({ testTimeout: 20_000 });
import { render, screen, within } from '@testing-library/react';
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

import BlogPostPage, { generateMetadata } from './[slug]/page';

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
    modifiedDateLocal: '2026-11-21T09:00:00',
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

  it('says when a post was updated, but not for a change on the day it went out', async () => {
    const sameDay = post('<p>Body.</p>');
    getPostBySlug.mockResolvedValue(sameDay);
    const { unmount } = render(
      await BlogPostPage({ params: Promise.resolve({ slug: sameDay.slug }) })
    );
    expect(screen.queryByText(/Updated/)).toBeNull();
    unmount();

    const later = { ...post('<p>Body.</p>'), modifiedDateLocal: '2026-11-24T10:00:00' };
    later.modifiedDate = '2026-11-24T04:30:00Z';
    getPostBySlug.mockResolvedValue(later);
    render(await BlogPostPage({ params: Promise.resolve({ slug: later.slug }) }));

    const updated = screen.getByText(/Updated/);
    expect(updated.textContent).toBe('Updated November 24, 2026');
    expect(updated.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-24T04:30:00Z');
  });

  it('offers ways to share the post, with its canonical address', async () => {
    const current = await renderPost('<p>Body.</p>');

    const x = screen.getByRole('link', { name: 'Share on X (opens in a new tab)' });
    expect(x.getAttribute('href')).toContain(
      encodeURIComponent(`https://opndrive.app/blog/${current.slug}`)
    );
  });

  it('shares a post without a cover with the one drawn from its title', async () => {
    const current = post('<p>Body.</p>');
    getPostBySlug.mockResolvedValue(current);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: current.slug }) });
    const images = metadata.openGraph?.images as Array<{ url: string; width: number }>;

    expect(
      images[0]!.url.startsWith(`https://opndrive.app/blog/${current.slug}/cover.png?v=`)
    ).toBe(true);
    expect(images[0]!.width).toBe(1200);
    expect(metadata.twitter?.images).toEqual([images[0]!.url]);
    expect(metadata.alternates?.types?.['application/rss+xml']).toBeDefined();
  });

  it("shares a post with its cover's own size and description", async () => {
    const featuredImage = {
      url: 'https://wp.example/cover.webp',
      alt: 'The cover',
      width: 1600,
      height: 900,
    };
    // transformPost puts the featured image in seo.ogImage when no SEO plugin
    // sets one of its own.
    const current = { ...post('<p>Body.</p>'), featuredImage };
    current.seo = { ...current.seo, ogImage: featuredImage.url };
    getPostBySlug.mockResolvedValue(current);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: current.slug }) });

    expect(metadata.openGraph?.images).toEqual([
      { url: featuredImage.url, width: 1600, height: 900, alt: 'The cover' },
    ]);
  });

  it('points the FAQPage at the FAQ heading that is on the page', async () => {
    await renderPost('<h2>Frequently asked questions</h2><h3>Q?</h3><p>A.</p>');

    const json = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => script.textContent ?? '')
      .join(' ');
    expect(json).toContain('#frequently-asked-questions"');
    expect(document.getElementById('frequently-asked-questions')).not.toBeNull();
  });

  it('describes the post once, as a BlogPosting, and its own FAQ as an FAQPage', async () => {
    await renderPost('<p>Body.</p><h2>FAQ</h2><h3>Does CORS cause it?</h3><p>No.</p>');

    const json = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => script.textContent ?? '')
      .join(' ');
    expect(json).toContain('"@type":"BlogPosting"');
    expect(json).not.toContain('"@type":"Article"');
    expect(json).toContain('"@type":"FAQPage"');
    expect(json).toContain('"name":"Does CORS cause it?"');
  });

  it('leads back to the blog, and offers its feed and Discord', async () => {
    await renderPost('<p>Body.</p>');

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Blog' }).getAttribute('href')).toBe(
      '/blog'
    );
    expect(screen.getByRole('link', { name: 'RSS feed' }).getAttribute('href')).toBe(
      '/blog/rss.xml'
    );
    expect(
      screen
        .getByRole('link', { name: 'Join our Discord (opens in a new tab)' })
        .getAttribute('target')
    ).toBe('_blank');
  });

  it('links Get Started to /connect', async () => {
    await renderPost('<p>Body.</p>');

    const links = screen.getAllByRole('link', { name: 'Get Started' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toBe('/connect');
  });
});
