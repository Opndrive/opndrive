/**
 * What the blog tells search engines and language-model tools: one
 * BlogPosting per post, the FAQ it answers, the posts the blog lists, and
 * /llms.txt.
 */
import { describe, expect, it } from 'vitest';
import type { BlogPost } from '@/lib/wordpress/types';
import { coverImageFor } from '@/lib/blog-cover/cover-url';
import {
  generateBlogPostingSchema,
  generateBlogSchema,
  generateFaqPageSchema,
} from './structured-data';
import { buildLlmsTxt } from './llms-txt';

const post: BlogPost = {
  id: 'p1',
  slug: 'fix-signature',
  title: 'Fix SignatureDoesNotMatch',
  excerpt: 'Compare signed and sent headers.',
  content: '<p>One <strong>two</strong> three.</p><pre><code>four five</code></pre>',
  publishedDate: '2026-11-21T03:30:00Z',
  publishedDateLocal: '2026-11-21T09:00:00',
  modifiedDate: '2026-11-22T03:30:00Z',
  modifiedDateLocal: '2026-11-22T09:00:00',
  author: { name: 'Opndrive' },
  categories: [{ id: 'c', name: 'Troubleshooting', slug: 'troubleshooting' }],
  tags: [],
  seo: { title: 'Fix SignatureDoesNotMatch', description: 'Compare signed and sent headers.' },
};

describe('generateBlogPostingSchema', () => {
  const schema = generateBlogPostingSchema(post, coverImageFor(post));

  it('describes the post with its drawn cover as an absolute image', () => {
    expect(schema['@type']).toBe('BlogPosting');
    expect(schema.image).toMatchObject({
      url: expect.stringMatching(/^https:\/\/opndrive\.app\/blog\/fix-signature\/cover\.png\?v=/),
      width: 1200,
      height: 630,
    });
    expect(schema.url).toBe('https://opndrive.app/blog/fix-signature');
    expect(schema.isPartOf).toEqual({ '@id': 'https://opndrive.app/blog#blog' });
  });

  it('credits the organisation as an organisation, with no link to a missing page', () => {
    expect(schema.author).toEqual({
      '@type': 'Organization',
      name: 'Opndrive',
      url: 'https://opndrive.app',
    });
    expect(JSON.stringify(schema)).not.toContain('/about');
  });

  it('counts the words of the text, not of its markup', () => {
    expect(schema.wordCount).toBe(5);
  });

  it('calls a named writer a person', () => {
    const byPerson = generateBlogPostingSchema(
      { ...post, author: { name: 'Yash' } },
      coverImageFor(post)
    );
    expect(byPerson.author).toEqual({ '@type': 'Person', name: 'Yash' });
  });
});

describe('generateFaqPageSchema', () => {
  it('lists each question with its accepted answer', () => {
    const schema = generateFaqPageSchema(
      'fix-signature',
      [{ question: 'Can CORS cause it?', answer: 'No. CORS fails first.' }],
      'frequently-asked-questions'
    );

    expect(schema).toMatchObject({
      '@type': 'FAQPage',
      // The address of the FAQ heading that is really on the page.
      url: 'https://opndrive.app/blog/fix-signature#frequently-asked-questions',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Can CORS cause it?',
          acceptedAnswer: { '@type': 'Answer', text: 'No. CORS fails first.' },
        },
      ],
    });
  });
});

describe('fitting text at a word', () => {
  it('keeps every character up to the cut when there is no space to stop at', async () => {
    const { fitTitle } = await import('@/lib/blog-cover/render-cover');
    const unbroken = 'x'.repeat(200);

    expect(fitTitle(unbroken)).toBe(`${'x'.repeat(150)}…`);
  });
});

describe('generateBlogSchema', () => {
  it('lists the posts the page shows', () => {
    const schema = generateBlogSchema([post]);

    expect(schema['@id']).toBe('https://opndrive.app/blog#blog');
    expect(schema.blogPost).toEqual([
      expect.objectContaining({
        '@type': 'BlogPosting',
        headline: 'Fix SignatureDoesNotMatch',
        url: 'https://opndrive.app/blog/fix-signature',
      }),
    ]);
  });

  it('leaves the list out for a blog with no posts', () => {
    expect(generateBlogSchema()).not.toHaveProperty('blogPost');
  });
});

describe('buildLlmsTxt', () => {
  const input = {
    siteUrl: 'https://opndrive.app',
    docsUrl: 'https://docs.opndrive.app',
    repositoryUrl: 'https://github.com/Opndrive/opndrive',
    providers: [
      { slug: 'cloudflare-r2', name: 'Cloudflare R2', tagline: 'S3 API with no egress fees' },
    ],
    providersPhrase: 'Amazon S3, Cloudflare R2',
    licenseName: 'AGPL-3.0',
    posts: [
      {
        slug: 'fix-signature',
        title: 'Fix [SignatureDoesNotMatch]',
        excerpt: 'Compare signed\nand sent headers.',
      },
    ],
  };

  it('starts with a title and a one-paragraph summary', () => {
    const lines = buildLlmsTxt(input).split('\n');
    expect(lines[0]).toBe('# Opndrive');
    expect(lines[2]).toMatch(/^> Open-source web interface for S3-compatible storage\./);
    expect(lines[2]).toContain('Amazon S3, Cloudflare R2');
  });

  it('links the pages worth reading, each with a line about it', () => {
    const text = buildLlmsTxt(input);
    expect(text).toContain(
      '- [Connect Cloudflare R2](https://opndrive.app/connect/cloudflare-r2): S3 API with no egress fees'
    );
    expect(text).toContain('## Documentation');
    // Titles and excerpts are flattened so they cannot break the list.
    expect(text).toContain(
      '- [Fix SignatureDoesNotMatch](https://opndrive.app/blog/fix-signature): Compare signed and sent headers.'
    );
  });

  it('leaves the blog out when nothing is known about it', () => {
    const text = buildLlmsTxt({ ...input, posts: null });
    expect(text).not.toContain('## Blog');
    expect(text).not.toContain('rss.xml');
  });
});
