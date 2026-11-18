/**
 * How a WPGraphQL post becomes a BlogPost: text decoded once, dates as the
 * exact UTC instant for machines and the site's own clock for readers.
 */
import { describe, expect, it } from 'vitest';
import { transformPost } from './service';
import type { WordPressPost } from './types';

function wpPost(overrides: Partial<WordPressPost> = {}): WordPressPost {
  return {
    id: 'cG9zdDox',
    databaseId: 1,
    slug: 'cors-for-r2',
    title: 'Don&#8217;t skip CORS &amp; preflights',
    excerpt: '<p>Why the preflight fails &hellip;</p>\n',
    content: '<p>Body &amp; more</p>',
    date: '2026-11-01T09:00:00',
    dateGmt: '2026-11-01T03:30:00',
    modified: '2026-11-02T10:00:00',
    modifiedGmt: '2026-11-02T04:30:00',
    categories: { nodes: [{ id: 'c1', name: 'Guides &amp; tips', slug: 'guides' }] },
    tags: { nodes: [] },
    ...overrides,
  } as WordPressPost;
}

describe('transformPost', () => {
  it('decodes the rendered title, excerpt and term names into plain text', () => {
    const post = transformPost(wpPost());

    expect(post.title).toBe('Don’t skip CORS & preflights');
    expect(post.excerpt).toBe('Why the preflight fails …');
    expect(post.categories[0]!.name).toBe('Guides & tips');
    expect(post.seo?.title).toBe('Don’t skip CORS & preflights');
  });

  it('leaves the HTML content as WordPress rendered it', () => {
    expect(transformPost(wpPost()).content).toBe('<p>Body &amp; more</p>');
  });

  it('keeps a decoded "<" in an excerpt as text, not as a tag to strip', () => {
    const post = transformPost(wpPost({ excerpt: '<p>When a &lt; b</p>' }));
    expect(post.excerpt).toBe('When a < b');
  });

  it('gives machines the UTC instant and readers the site clock', () => {
    const post = transformPost(wpPost());

    expect(post.publishedDate).toBe('2026-11-01T03:30:00Z');
    expect(post.modifiedDate).toBe('2026-11-02T04:30:00Z');
    expect(post.publishedDateLocal).toBe('2026-11-01T09:00:00');
  });

  it('cuts a long excerpt at 160 characters without splitting an emoji', () => {
    // 159 letters, then an emoji WordPress sent as a reference: a cut by
    // UTF-16 unit would keep only half of it.
    const excerpt = `<p>${'a'.repeat(159)}&#128512; and more</p>`;
    const description = transformPost(wpPost({ excerpt })).seo!.description;

    expect(Array.from(description)).toHaveLength(160);
    expect(description.codePointAt(159)).toBe(0x1f600);
  });

  it('falls back to the local time when WordPress gives no GMT twin', () => {
    const post = transformPost(wpPost({ dateGmt: undefined, modifiedGmt: undefined }));

    expect(post.publishedDate).toBe('2026-11-01T09:00:00');
    expect(post.modifiedDate).toBe('2026-11-02T10:00:00');
  });
});
