import { describe, expect, it } from 'vitest';
import {
  POSTS_PER_PAGE,
  blogIndexRobots,
  blogSitemapEntries,
  paginateBlogIndex,
  parseBlogPageParam,
} from './blog-index';

describe('blogIndexRobots', () => {
  it('keeps an empty blog out of the index but lets its links be followed', () => {
    expect(blogIndexRobots(0)).toEqual({ index: false, follow: true });
  });

  it('makes the blog indexable as soon as it has a post', () => {
    const robots = blogIndexRobots(1);
    expect(robots).toMatchObject({ index: true, follow: true });
  });

  it('keeps the blog indexable when WordPress could not be asked', () => {
    // One failed request while Googlebot crawls must not deindex a blog that
    // has posts; unknown is not empty.
    expect(blogIndexRobots(null)).toMatchObject({ index: true, follow: true });
  });
});

describe('blogSitemapEntries', () => {
  const site = 'https://opndrive.app';

  it('lists nothing while there are no posts, not even the index', () => {
    expect(blogSitemapEntries([], site)).toEqual([]);
  });

  it('keeps the index listed when WordPress could not be asked', () => {
    expect(blogSitemapEntries(null, site)).toEqual([{ url: 'https://opndrive.app/blog' }]);
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

describe('parseBlogPageParam', () => {
  it('reads no parameter as page 1', () => {
    expect(parseBlogPageParam(undefined)).toBe(1);
  });

  it('reads a page past the first as its number', () => {
    expect(parseBlogPageParam('2')).toBe(2);
    expect(parseBlogPageParam('37')).toBe(37);
  });

  it('sends page 1 by name to /blog, so it has one address', () => {
    expect(parseBlogPageParam('1')).toBe('canonical');
  });

  it('sends anything that is not a page number to /blog', () => {
    for (const raw of ['abc', '0', '-1', '2.5', '02', ' 2', '', '1e3', '9999999']) {
      expect(parseBlogPageParam(raw)).toBe('canonical');
    }
    // ?page=2&page=3 arrives as an array.
    expect(parseBlogPageParam(['2', '3'])).toBe('canonical');
  });
});

describe('paginateBlogIndex', () => {
  const posts = (count: number) => Array.from({ length: count }, (_, i) => `post-${i}`);

  it('leads page 1 with the newest post and follows it with the next page of cards', () => {
    const view = paginateBlogIndex(posts(25), 1);

    expect(view?.featured).toBe('post-0');
    expect(view?.posts).toEqual(posts(25).slice(1, 1 + POSTS_PER_PAGE));
    expect(view?.totalPages).toBe(3);
  });

  it('shows no featured post after page 1, and carries on where page 1 stopped', () => {
    const view = paginateBlogIndex(posts(25), 2);

    expect(view?.featured).toBeNull();
    expect(view?.posts[0]).toBe(`post-${1 + POSTS_PER_PAGE}`);
    expect(view?.posts).toHaveLength(POSTS_PER_PAGE);
  });

  it('lists every post exactly once across the pages', () => {
    const all = posts(37);
    const seen: string[] = [];
    for (let page = 1; ; page++) {
      const view = paginateBlogIndex(all, page);
      if (!view) break;
      if (view.featured) seen.push(view.featured);
      seen.push(...view.posts);
    }
    expect(seen).toEqual(all);
  });

  it('has nothing for a page past the last one', () => {
    expect(paginateBlogIndex(posts(25), 4)).toBeNull();
    expect(paginateBlogIndex(posts(1), 2)).toBeNull();
  });

  it('gives page 1 with only the featured post when there is one post', () => {
    expect(paginateBlogIndex(posts(1), 1)).toEqual({
      featured: 'post-0',
      posts: [],
      totalPages: 0,
    });
  });

  it('gives an empty page 1 for an empty blog, rather than nothing', () => {
    expect(paginateBlogIndex([], 1)).toEqual({ featured: null, posts: [], totalPages: 0 });
  });
});

describe('blogSitemapEntries for authors and topics', () => {
  const site = 'https://opndrive.app';
  const post = (slug: string, modifiedDate: string, count: number) => ({
    slug,
    modifiedDate,
    authorSlug: 'yash',
    categories: [{ slug: 'troubleshooting', count }],
  });

  it('lists each author once, dated by their newest post', () => {
    const entries = blogSitemapEntries(
      [post('a', '2026-11-21T00:00:00Z', 2), post('b', '2026-11-26T00:00:00Z', 2)],
      site
    );
    const authorEntries = entries.filter((entry) => entry.url.includes('/blog/author/'));

    expect(authorEntries).toEqual([
      {
        url: 'https://opndrive.app/blog/author/yash',
        lastModified: new Date('2026-11-26T00:00:00Z'),
      },
    ]);
  });

  it('lists a topic only once it has a hub', () => {
    const without = blogSitemapEntries([post('a', '2026-11-21T00:00:00Z', 2)], site);
    const withHub = blogSitemapEntries([post('a', '2026-11-21T00:00:00Z', 3)], site);

    expect(without.some((entry) => entry.url.includes('/blog/category/'))).toBe(false);
    expect(withHub.map((entry) => entry.url)).toContain(
      'https://opndrive.app/blog/category/troubleshooting'
    );
  });
});
