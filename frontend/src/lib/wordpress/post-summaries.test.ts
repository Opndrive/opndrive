/**
 * getPostSummaries: the list query behind the blog index and the feed. It
 * pages through WordPress with the cursor, stops at the limit, and never asks
 * for a post's body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordPressPostSummary } from './types';

const fetchGraphQLWithTags = vi.fn();

vi.mock('./client', () => ({
  fetchGraphQL: vi.fn(),
  fetchGraphQLWithTags: (...args: unknown[]) => fetchGraphQLWithTags(...args),
}));

import { getPostSummaries } from './service';
import { GET_POST_SUMMARIES } from './queries-simple';

function node(n: number): WordPressPostSummary {
  return {
    id: `id-${n}`,
    databaseId: n,
    slug: `post-${n}`,
    title: `Post&nbsp;${n}`,
    excerpt: `<p>About ${n}</p>`,
    date: '2026-11-01T09:00:00',
    dateGmt: '2026-11-01T03:30:00',
    modified: '2026-11-02T10:00:00',
    modifiedGmt: '2026-11-02T04:30:00',
    author: { node: { name: 'Opndrive' } },
    categories: { nodes: [] },
  };
}

function page(from: number, count: number, endCursor: string | null, hasNextPage: boolean) {
  return {
    posts: {
      nodes: Array.from({ length: count }, (_, i) => node(from + i)),
      pageInfo: { hasNextPage, endCursor },
    },
  };
}

beforeEach(() => {
  fetchGraphQLWithTags.mockReset();
});

describe('getPostSummaries', () => {
  it('follows the cursor until WordPress says there is no next page', async () => {
    fetchGraphQLWithTags
      .mockResolvedValueOnce(page(0, 100, 'c1', true))
      .mockResolvedValueOnce(page(100, 100, 'c2', true))
      .mockResolvedValueOnce(page(200, 37, 'c3', false));

    const posts = await getPostSummaries({ limit: 1000 });

    expect(posts).toHaveLength(237);
    expect(posts[236]!.slug).toBe('post-236');
    const cursors = fetchGraphQLWithTags.mock.calls.map((call) => call[1].after);
    expect(cursors).toEqual([null, 'c1', 'c2']);
  });

  it('asks only for what is left of the limit, and stops there', async () => {
    fetchGraphQLWithTags
      .mockResolvedValueOnce(page(0, 100, 'c1', true))
      .mockResolvedValueOnce(page(100, 50, 'c2', true));

    const posts = await getPostSummaries({ limit: 150 });

    expect(posts).toHaveLength(150);
    expect(fetchGraphQLWithTags).toHaveBeenCalledTimes(2);
    expect(fetchGraphQLWithTags.mock.calls[1]![1].first).toBe(50);
  });

  it('stops on a page without a cursor, whatever hasNextPage says', async () => {
    fetchGraphQLWithTags.mockResolvedValueOnce(page(0, 3, null, true));

    expect(await getPostSummaries({ limit: 1000 })).toHaveLength(3);
    expect(fetchGraphQLWithTags).toHaveBeenCalledTimes(1);
  });

  it('decodes the text and passes the cache lifetime on', async () => {
    fetchGraphQLWithTags.mockResolvedValueOnce(page(0, 1, null, false));

    const [post] = await getPostSummaries({ limit: 10, revalidate: 3600 });

    expect(post!.title).toBe('Post 0');
    expect(post!.excerpt).toBe('About 0');
    expect(fetchGraphQLWithTags.mock.calls[0]![3]).toBe(3600);
  });

  it('never asks WordPress for a post body', () => {
    // The body is what made listing every post expensive.
    expect(GET_POST_SUMMARIES).not.toMatch(/\bcontent\b/);
  });
});
