/**
 * What a post, an author page and a topic hub tell search engines: the whole
 * Yoast description and title, a canonical that is always the page's own
 * address, a byline that leads to the author, and hubs only for topics with
 * enough posts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20_000 });
import { render, screen } from '@testing-library/react';
import type { BlogPost, BlogPostSummary } from '@/lib/wordpress/types';

const service = vi.hoisted(() => ({
  getPostBySlug: vi.fn(),
  getRelatedPosts: vi.fn(),
  getAuthor: vi.fn(),
  getCategoryHub: vi.fn(),
}));

vi.mock('@/lib/wordpress/service', () => service);
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => true,
  requiresWordPressCredentials: () => true,
}));
vi.mock('@/components/blog/blog-navbar', () => ({ default: () => null }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import BlogPostPage, { generateMetadata as postMetadata } from './[slug]/page';
import AuthorPage, { generateMetadata as authorMetadata } from './author/[slug]/page';
import CategoryHubPage, { generateMetadata as hubMetadata } from './category/[slug]/page';

const DESCRIPTION =
  'Presigned upload works in curl but fails in the browser? Compare X-Amz-SignedHeaders with what the browser sent, then fix Content-Type, checksums, URL or keys.';

const author = { name: 'Yash Sangwan', slug: 'yash', bio: '', sameAs: [] };

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    slug: 'fix-signaturedoesnotmatch',
    title: 'Fix SignatureDoesNotMatch on browser uploads to S3 and S3-compatible storage',
    excerpt: 'Compare headers.',
    description: DESCRIPTION,
    content: '<p>Body.</p>',
    publishedDate: '2026-11-21T03:30:00Z',
    publishedDateLocal: '2026-11-21T09:00:00',
    modifiedDate: '2026-11-21T03:30:00Z',
    modifiedDateLocal: '2026-11-21T09:00:00',
    author,
    categories: [{ id: 'c', name: 'Troubleshooting', slug: 'troubleshooting', count: 3 }],
    tags: [],
    seo: { title: 'Fix SignatureDoesNotMatch on browser uploads', description: DESCRIPTION },
    ...overrides,
  };
}

const summary = (n: number): BlogPostSummary => ({
  id: `s${n}`,
  slug: `post-${n}`,
  title: `Post ${n}`,
  excerpt: `Excerpt ${n}`,
  description: `Description of post ${n}.`,
  publishedDate: '2026-11-21T03:30:00Z',
  publishedDateLocal: '2026-11-21T09:00:00',
  modifiedDate: '2026-11-21T03:30:00Z',
  modifiedDateLocal: '2026-11-21T09:00:00',
  author,
  categories: [],
  tags: [],
});

beforeEach(() => {
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://cms.example/graphql');
  service.getRelatedPosts.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("a post's head", () => {
  it('says the whole Yoast description and the Yoast title everywhere', async () => {
    service.getPostBySlug.mockResolvedValue(post());
    const meta = await postMetadata({
      params: Promise.resolve({ slug: 'fix-signaturedoesnotmatch' }),
    });

    expect(meta.description).toBe(DESCRIPTION);
    expect(meta.openGraph?.description).toBe(DESCRIPTION);
    expect(meta.twitter?.description).toBe(DESCRIPTION);
    expect(meta.title).toBe('Fix SignatureDoesNotMatch on browser uploads');
    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.twitter?.title).toBe(meta.title);
  });

  it('keeps the canonical at its own address', async () => {
    service.getPostBySlug.mockResolvedValue(post());
    const meta = await postMetadata({
      params: Promise.resolve({ slug: 'fix-signaturedoesnotmatch' }),
    });

    expect(meta.alternates?.canonical).toBe('https://opndrive.app/blog/fix-signaturedoesnotmatch');
  });
});

describe("a post's page", () => {
  it('leads its byline to the author and its breadcrumb to the topic hub', async () => {
    service.getPostBySlug.mockResolvedValue(post());
    const { container } = render(
      await BlogPostPage({ params: Promise.resolve({ slug: 'fix-signaturedoesnotmatch' }) })
    );

    expect(screen.getByRole('link', { name: 'Yash Sangwan' }).getAttribute('href')).toBe(
      '/blog/author/yash'
    );
    expect(screen.getByRole('link', { name: 'Troubleshooting' }).getAttribute('href')).toBe(
      '/blog/category/troubleshooting'
    );

    // One script per StructuredData, each holding one item or an array of them.
    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].flatMap(
      (script) => [JSON.parse(script.textContent ?? '{}')].flat()
    );
    const posting = jsonLd.find((item) => item['@type'] === 'BlogPosting');
    const breadcrumb = jsonLd.find((item) => item['@type'] === 'BreadcrumbList');
    expect(posting.author).toMatchObject({ '@type': 'Person', name: 'Yash Sangwan' });
    expect(posting.publisher['@type']).toBe('Organization');
    expect(breadcrumb.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      'Home',
      'Blog',
      'Troubleshooting',
      post().title,
    ]);
  });

  it('links no hub for a topic with fewer than three posts', async () => {
    service.getPostBySlug.mockResolvedValue(
      post({ categories: [{ id: 'g', name: 'Guides', slug: 'guides', count: 2 }] })
    );
    render(await BlogPostPage({ params: Promise.resolve({ slug: 'fix-signaturedoesnotmatch' }) }));

    expect(screen.queryByRole('link', { name: 'Guides' })).toBeNull();
  });
});

describe('an author page', () => {
  it("titles Opndrive's own page without naming it twice", async () => {
    service.getAuthor.mockResolvedValue({
      name: 'Opndrive',
      slug: 'opndrive',
      bio: 'Opndrive is a free, open-source web UI for S3-compatible storage. Self-host it to browse, upload and share files on AWS S3, MinIO, Cloudflare R2, Backblaze B2 and more.',
      sameAs: [],
      posts: [summary(1)],
    });
    const meta = await authorMetadata({ params: Promise.resolve({ slug: 'opndrive' }) });

    expect(meta.title).toBe('About Opndrive: every post on the blog');
    expect(String(meta.description).length).toBeLessThan(160);
    expect(String(meta.description)).not.toMatch(/\.\.\.$/);
  });

  it('shows the name and the posts, and no empty bio', async () => {
    service.getAuthor.mockResolvedValue({ ...author, posts: [summary(1), summary(2)] });
    const { container } = render(await AuthorPage({ params: Promise.resolve({ slug: 'yash' }) }));

    expect(screen.getByRole('heading', { level: 1, name: 'Yash Sangwan' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Post 1' }).getAttribute('href')).toBe('/blog/post-1');
    expect(screen.getByText('Description of post 2.')).toBeDefined();
    expect(container.querySelector('header p')).toBeNull();
  });

  it('shows the bio and links when the profile has them', async () => {
    service.getAuthor.mockResolvedValue({
      ...author,
      bio: 'Builds Opndrive.',
      sameAs: ['https://github.com/someone'],
      posts: [summary(1)],
    });
    render(await AuthorPage({ params: Promise.resolve({ slug: 'yash' }) }));

    expect(screen.getByText('Builds Opndrive.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'github.com' }).getAttribute('href')).toBe(
      'https://github.com/someone'
    );
  });

  it('is indexable, with its own canonical', async () => {
    service.getAuthor.mockResolvedValue({ ...author, posts: [summary(1)] });
    const meta = await authorMetadata({ params: Promise.resolve({ slug: 'yash' }) });

    expect(meta.alternates?.canonical).toBe('https://opndrive.app/blog/author/yash');
    expect(meta.robots).toMatchObject({ index: true, follow: true });
    expect(String(meta.description).length).toBeLessThan(160);
  });

  it('does not exist for an unknown author', async () => {
    service.getAuthor.mockResolvedValue(null);
    await expect(AuthorPage({ params: Promise.resolve({ slug: 'nobody' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });
});

describe('a topic hub', () => {
  const hub = (count: number) => ({
    name: 'Troubleshooting',
    slug: 'troubleshooting',
    description: '',
    count,
    posts: Array.from({ length: count }, (_, i) => summary(i + 1)),
  });

  it('lists its posts with an introduction, once it has three', async () => {
    service.getCategoryHub.mockResolvedValue(hub(3));
    render(await CategoryHubPage({ params: Promise.resolve({ slug: 'troubleshooting' }) }));

    expect(screen.getByRole('heading', { level: 1, name: 'Troubleshooting' })).toBeDefined();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText(/newest first/)).toBeDefined();
  });

  it('does not exist with fewer than three posts', async () => {
    service.getCategoryHub.mockResolvedValue(hub(2));
    await expect(
      CategoryHubPage({ params: Promise.resolve({ slug: 'troubleshooting' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    const meta = await hubMetadata({ params: Promise.resolve({ slug: 'troubleshooting' }) });
    expect(meta.title).toBe('Topic Not Found');
  });

  it('uses the category description as its introduction and description', async () => {
    service.getCategoryHub.mockResolvedValue({
      ...hub(3),
      description: 'Fixes for the errors S3-compatible storage throws at a browser.',
    });
    const meta = await hubMetadata({ params: Promise.resolve({ slug: 'troubleshooting' }) });

    expect(meta.description).toBe(
      'Fixes for the errors S3-compatible storage throws at a browser.'
    );
    expect(meta.alternates?.canonical).toBe('https://opndrive.app/blog/category/troubleshooting');
  });
});
