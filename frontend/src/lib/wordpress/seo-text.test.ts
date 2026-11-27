import { describe, expect, it } from 'vitest';
import { authorSameAs, descriptionFromText, hasHub, hubFor, searchTitle } from './seo-text';
import { transformPost, transformPostSummary } from './service';
import type { WordPressPost } from './types';

describe('the search title', () => {
  it('is the Yoast SEO title as the editor set it', () => {
    expect(
      searchTitle('S3 CORS: one guide for five providers', 'A longer post title', 'Example Press')
    ).toBe('S3 CORS: one guide for five providers');
  });

  it.each([
    ['Post title - Example Press'],
    ['Post title | Example Press'],
    ['Post title – Example Press'],
    ['Post title — example press'],
    ['Post title - Opndrive'],
  ])('drops the site name a Yoast template ended %j with', (yoast) => {
    expect(searchTitle(yoast, 'Post title', 'Example Press')).toBe('Post title');
  });

  it('keeps a site name that is part of the title itself', () => {
    expect(searchTitle('Opndrive vs Cyberduck for S3', 'x', 'Example Press')).toBe(
      'Opndrive vs Cyberduck for S3'
    );
  });

  it('falls back to the post title when Yoast gives nothing', () => {
    expect(searchTitle('', 'Post title', 'Example Press')).toBe('Post title');
    expect(searchTitle(null, 'Post title')).toBe('Post title');
    expect(searchTitle(' - Example Press', 'Post title', 'Example Press')).toBe('- Example Press');
  });
});

describe('a description built from an excerpt', () => {
  it('is the excerpt itself when it is short', () => {
    expect(descriptionFromText('Short and sweet.')).toBe('Short and sweet.');
  });

  it('is cut at a word, under 160 characters, with no "..." added', () => {
    const long = `${'word '.repeat(40)}end`;
    const cut = descriptionFromText(long);

    expect(Array.from(cut).length).toBeLessThan(160);
    expect(cut.endsWith('word')).toBe(true);
    expect(cut).not.toMatch(/\.\.\.|…$/);
  });

  it("drops WordPress's own [...] from the end of an excerpt", () => {
    expect(descriptionFromText('The summary […]')).toBe('The summary');
    expect(descriptionFromText('The summary …')).toBe('The summary');
  });

  it('keeps what fits when there is no space to stop at', () => {
    expect(Array.from(descriptionFromText('x'.repeat(300))).length).toBe(159);
  });
});

describe('the author links', () => {
  it('takes the website and every profile, an X username as an address', () => {
    expect(
      authorSameAs('https://yash.example', {
        twitter: '@opndrive',
        linkedIn: 'https://www.linkedin.com/in/someone',
        facebook: '',
        youTube: null,
      })
    ).toEqual([
      'https://yash.example/',
      'https://x.com/opndrive',
      'https://www.linkedin.com/in/someone',
    ]);
  });

  it('leaves out anything that is not a web address, and repeats', () => {
    expect(
      authorSameAs('not a url', { linkedIn: 'javascript:alert(1)', wikipedia: 'https://a.test/' })
    ).toEqual(['https://a.test/']);
    expect(authorSameAs('https://a.test/', { instagram: 'https://a.test/' })).toEqual([
      'https://a.test/',
    ]);
  });

  it('is empty for a profile with nothing filled in', () => {
    expect(authorSameAs(null, null)).toEqual([]);
  });
});

describe('topic hubs', () => {
  it('exist from three published posts', () => {
    expect(hasHub({ slug: 'troubleshooting', count: 3 })).toBe(true);
    expect(hasHub({ slug: 'guides', count: 2 })).toBe(false);
    expect(hasHub({ slug: 'comparisons', count: null })).toBe(false);
  });

  it('never exist for Uncategorized', () => {
    expect(hasHub({ slug: 'uncategorized', count: 40 })).toBe(false);
  });

  it("are a post's first category that has one", () => {
    expect(
      hubFor([
        { slug: 'guides', count: 2 },
        { slug: 'troubleshooting', count: 3 },
      ])?.slug
    ).toBe('troubleshooting');
    expect(hubFor([{ slug: 'guides', count: 2 }])).toBeNull();
  });
});

describe('a post from WordPress', () => {
  const wordpressPost = (
    seo: WordPressPost['seo'],
    excerpt = '<p>The excerpt.</p>'
  ): WordPressPost => ({
    id: 'p',
    databaseId: 1,
    slug: 'a-post',
    title: 'A post title that an editor kept to sixty-five characters long',
    excerpt,
    content: '<p>Body</p>',
    date: '2026-11-21T09:00:00',
    dateGmt: '2026-11-21T03:30:00',
    modified: '2026-11-21T09:00:00',
    modifiedGmt: '2026-11-21T03:30:00',
    author: {
      node: {
        name: 'Yash Sangwan',
        slug: 'yash',
        url: 'https://yash.example',
        description: '<p>Builds Opndrive.</p>',
        seo: { social: { twitter: 'opndrive' } },
      },
    },
    categories: {
      nodes: [{ id: 'c', name: 'Troubleshooting', slug: 'troubleshooting', count: 3 }],
    },
    tags: { nodes: [] },
    seo,
  });

  const description159 =
    'Presigned URL shows http://minio:9000 and the browser can’t reach it? Sign with a second S3 client on the public endpoint. JS v3 and boto3 code, Compose, curl.';

  it('keeps the whole Yoast description, with nothing cut', () => {
    const post = transformPost(wordpressPost({ title: 'Short title', metaDesc: description159 }));

    expect(Array.from(description159).length).toBe(159);
    expect(post.description).toBe(description159);
    expect(post.seo.description).toBe(description159);
  });

  it('falls back to the excerpt, stripped of its HTML, without a Yoast description', () => {
    const post = transformPost(
      wordpressPost({ title: '' }, '<p>The <strong>excerpt</strong> [&hellip;]</p>')
    );
    expect(post.description).toBe('The excerpt');
  });

  it('uses the Yoast title, without the WordPress site name a template adds', () => {
    expect(transformPost(wordpressPost({ title: 'Short title' }), 'Example Press').seo.title).toBe(
      'Short title'
    );
    expect(
      transformPost(wordpressPost({ title: 'Hand-written post - Example Press' }), 'Example Press')
        .seo.title
    ).toBe('Hand-written post');
  });

  it('honours an editor marking the post noindex', () => {
    expect(transformPost(wordpressPost({ metaRobotsNoindex: 'noindex' })).seo.noindex).toBe(true);
    expect(transformPost(wordpressPost({ metaRobotsNoindex: 'index' })).seo.noindex).toBe(false);
  });

  it('carries no canonical from Yoast, whose canonical is the WordPress address', () => {
    const post = transformPost(
      wordpressPost({ canonical: 'https://cms.example/2026/11/21/a-post/' })
    );
    expect(JSON.stringify(post)).not.toContain('cms.example');
  });

  it('names its author with their profile slug, plain-text bio and links', () => {
    expect(transformPostSummary(wordpressPost({})).author).toEqual({
      name: 'Yash Sangwan',
      slug: 'yash',
      avatar: undefined,
      bio: 'Builds Opndrive.',
      sameAs: ['https://yash.example/', 'https://x.com/opndrive'],
    });
  });
});
