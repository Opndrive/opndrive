// @vitest-environment node
/**
 * The cover drawn from a post's title: where it lives, how its text is fitted,
 * and that the route answers with a PNG for a post and 404 without one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPostBySlug = vi.fn();
vi.mock('@/lib/wordpress/service', () => ({
  getPostBySlug: (...args: unknown[]) => getPostBySlug(...args),
}));
vi.mock('@/config/features', () => ({
  isBlogEnabled: () => true,
  requiresWordPressCredentials: () => true,
}));

import { coverImageFor, generatedCoverPath } from './cover-url';
import { fitTitle, titleFontSize } from './render-cover';
import { GET } from '@/app/blog/[slug]/cover.png/route';

const post = {
  slug: 'fix-signature',
  title: 'Fix SignatureDoesNotMatch on browser uploads',
  modifiedDate: '2026-11-21T03:30:00Z',
};

describe('coverImageFor', () => {
  it("uses the author's cover when there is one", () => {
    const featuredImage = {
      url: 'https://wp.example/c.png',
      alt: 'Cover',
      width: 1200,
      height: 630,
    };
    expect(coverImageFor({ ...post, featuredImage })).toBe(featuredImage);
  });

  it('otherwise points at the drawn cover, at an address that changes with the post', () => {
    const cover = coverImageFor({ ...post, featuredImage: undefined });

    expect(cover).toMatchObject({ alt: post.title, width: 1200, height: 630, generated: true });
    expect(cover.url).toBe(generatedCoverPath(post));
    expect(cover.url).toMatch(/^\/blog\/fix-signature\/cover\.png\?v=[0-9a-z]+$/);
    expect(generatedCoverPath({ ...post, modifiedDate: '2026-11-22T00:00:00Z' })).not.toBe(
      cover.url
    );
  });

  it('leaves the version off when the modified date cannot be read', () => {
    expect(generatedCoverPath({ slug: 'a', modifiedDate: '' })).toBe('/blog/a/cover.png');
  });
});

describe('fitting the title', () => {
  it('steps the size down as the title grows', () => {
    expect(titleFontSize('Short title')).toBe(72);
    expect(titleFontSize('x'.repeat(70))).toBe(60);
    expect(titleFontSize('x'.repeat(100))).toBe(52);
    expect(titleFontSize('x'.repeat(140))).toBe(44);
  });

  it('ends a very long title at a word, with an ellipsis', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const fitted = fitTitle(long);

    expect(fitted.endsWith('…')).toBe(true);
    expect(Array.from(fitted).length).toBeLessThanOrEqual(151);
    expect(long.startsWith(fitted.slice(0, -1))).toBe(true);
    expect(fitTitle('A short one')).toBe('A short one');
  });
});

describe('GET /blog/[slug]/cover.png', () => {
  beforeEach(() => {
    vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://wp.example.test/graphql');
    getPostBySlug.mockReset();
  });

  it('draws a PNG for a post, cached for a day', async () => {
    getPostBySlug.mockResolvedValue({
      ...post,
      categories: [{ id: 'c', name: 'Troubleshooting', slug: 'troubleshooting' }],
    });

    const response = await GET(new Request('http://localhost/blog/fix-signature/cover.png'), {
      params: Promise.resolve({ slug: 'fix-signature' }),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('max-age=86400');
    // The PNG signature.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 30000);

  it('answers 404 for a post WordPress does not have', async () => {
    getPostBySlug.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/blog/nope/cover.png'), {
      params: Promise.resolve({ slug: 'nope' }),
    });
    expect(response.status).toBe(404);
  });
});
