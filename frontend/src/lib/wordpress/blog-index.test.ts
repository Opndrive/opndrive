import { describe, expect, it } from 'vitest';
import { blogIndexRobots, blogSitemapEntries } from './blog-index';

describe('blogIndexRobots', () => {
  it('keeps an empty blog out of the index but lets its links be followed', () => {
    expect(blogIndexRobots(0)).toEqual({ index: false, follow: true });
  });

  it('makes the blog indexable as soon as it has a post', () => {
    const robots = blogIndexRobots(1);
    expect(robots).toMatchObject({ index: true, follow: true });
  });
});

describe('blogSitemapEntries', () => {
  const site = 'https://opndrive.app';

  it('lists nothing while there are no posts, not even the index', () => {
    expect(blogSitemapEntries([], site)).toEqual([]);
  });

  it('lists the index and every post, each post with its real modified date', () => {
    const entries = blogSitemapEntries(
      [
        { slug: 'first-post', modifiedDate: '2026-10-02T08:15:00Z' },
        { slug: 'second-post', modifiedDate: '2026-11-12T19:40:00Z' },
      ],
      site
    );

    expect(entries).toEqual([
      { url: 'https://opndrive.app/blog' },
      {
        url: 'https://opndrive.app/blog/first-post',
        lastModified: new Date('2026-10-02T08:15:00Z'),
      },
      {
        url: 'https://opndrive.app/blog/second-post',
        lastModified: new Date('2026-11-12T19:40:00Z'),
      },
    ]);
  });

  it('leaves the date off a post rather than inventing one', () => {
    const [, post] = blogSitemapEntries([{ slug: 'no-date', modifiedDate: '' }], site);
    expect(post).toEqual({ url: 'https://opndrive.app/blog/no-date' });
  });
});
