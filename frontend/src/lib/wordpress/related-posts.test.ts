/**
 * getRelatedPosts: the newest posts in the post's categories, topped up with
 * the newest overall, never the post itself or the same post twice - and
 * without fetching the post it was handed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordPressPostSummary } from './types';

const fetchGraphQLWithTags = vi.fn();
const fetchGraphQL = vi.fn();

vi.mock('./client', () => ({
  fetchGraphQL: (...args: unknown[]) => fetchGraphQL(...args),
  fetchGraphQLWithTags: (...args: unknown[]) => fetchGraphQLWithTags(...args),
}));

import { getRelatedPosts } from './service';
import { GET_POST_SUMMARIES, GET_RELATED_POST_SUMMARIES } from './queries-simple';

function node(slug: string): WordPressPostSummary {
  return {
    id: `id-${slug}`,
    databaseId: 1,
    slug,
    title: slug,
    excerpt: '',
    date: '2026-11-01T09:00:00',
    modified: '2026-11-01T09:00:00',
    author: { node: { name: 'Opndrive' } },
    categories: { nodes: [] },
  };
}

function answer(...slugs: string[]) {
  return { posts: { nodes: slugs.map(node), pageInfo: { hasNextPage: false, endCursor: null } } };
}

const current = {
  slug: 'current',
  categories: [{ id: 'dGVybTo0', name: 'Troubleshooting', slug: 'troubleshooting' }],
};

beforeEach(() => {
  fetchGraphQLWithTags.mockReset();
  fetchGraphQL.mockReset();
});

describe('getRelatedPosts', () => {
  it('takes the newest posts in its categories, skipping the post itself', async () => {
    fetchGraphQLWithTags.mockImplementation(async (query: string, variables) => {
      expect(query).toBe(GET_RELATED_POST_SUMMARIES);
      expect(variables).toEqual({ categoryIn: ['dGVybTo0'], first: 4 });
      return answer('current', 'a', 'b', 'c');
    });

    const related = await getRelatedPosts(current, 3);

    expect(related.map((post) => post.slug)).toEqual(['a', 'b', 'c']);
    expect(fetchGraphQLWithTags).toHaveBeenCalledTimes(1);
    // The post itself is never fetched again.
    expect(fetchGraphQL).not.toHaveBeenCalled();
  });

  it('tops up with the newest posts when its categories run short, without repeats', async () => {
    fetchGraphQLWithTags.mockImplementation(async (query: string) =>
      query === GET_POST_SUMMARIES ? answer('current', 'a', 'd', 'e') : answer('a', 'current')
    );

    const related = await getRelatedPosts(current, 3);

    expect(related.map((post) => post.slug)).toEqual(['a', 'd', 'e']);
  });

  it('uses the newest posts for a post with no categories', async () => {
    fetchGraphQLWithTags.mockResolvedValue(answer('x', 'current', 'y', 'z'));

    const related = await getRelatedPosts({ slug: 'current', categories: [] }, 3);

    expect(related.map((post) => post.slug)).toEqual(['x', 'y', 'z']);
    expect(fetchGraphQLWithTags.mock.calls[0]![0]).toBe(GET_POST_SUMMARIES);
  });

  it('never asks for post bodies', () => {
    expect(GET_RELATED_POST_SUMMARIES).not.toMatch(/\bcontent\b/);
  });
});
