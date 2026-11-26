/**
 * Which WordPress requests sign in. The public blog needs no credential and
 * sends none once the deprecated WORDPRESS_AUTH_TOKEN is unset. The preview
 * signs in as its own user, never cached. And whatever WordPress answers, a
 * public page only ever shows a published post.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

function respond(data: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data })));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_ENABLE_BLOG', 'true');
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://cms.example/graphql');
  vi.stubEnv('WORDPRESS_AUTH_TOKEN', '');
  vi.stubEnv('WORDPRESS_PREVIEW_USER', 'previewer');
  vi.stubEnv('WORDPRESS_PREVIEW_APP_PASSWORD', 'abcd efgh ijkl');
  respond({ post: null });
  vi.stubGlobal('fetch', fetchMock);
  // The client refuses to run where a window exists.
  vi.stubGlobal('window', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  fetchMock.mockReset();
});

function sentHeaders(): Record<string, string> {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

describe('public requests', () => {
  it('send no credential at all', async () => {
    const { fetchGraphQL } = await import('./client');
    await fetchGraphQL('query { posts { nodes { id } } }');

    expect(sentHeaders()).not.toHaveProperty('Authorization');
  });

  // Deprecated, kept only so a WordPress that refuses anonymous requests does
  // not take the blog down the day this ships.
  it('still send WORDPRESS_AUTH_TOKEN while it is set', async () => {
    vi.stubEnv('WORDPRESS_AUTH_TOKEN', 'legacy-token');
    const { fetchGraphQL } = await import('./client');
    await fetchGraphQL('query { posts { nodes { id } } }');

    expect(sentHeaders().Authorization).toBe('Bearer legacy-token');
  });
});

describe('a post looked up by slug for a public page', () => {
  const post = (status: string) => ({
    id: 'p',
    databaseId: 7,
    slug: 'a-post',
    title: 'A post',
    content: '<p>x</p>',
    excerpt: '',
    date: '2026-11-01T09:00:00',
    dateGmt: '2026-11-01T09:00:00',
    modified: '2026-11-01T09:00:00',
    modifiedGmt: '2026-11-01T09:00:00',
    status,
    author: { node: { name: 'Opndrive' } },
    categories: { nodes: [] },
    tags: { nodes: [] },
  });

  it('is shown when published', async () => {
    respond({ post: post('publish') });
    const { getPostBySlug } = await import('./service');

    expect(await getPostBySlug('a-post')).not.toBeNull();
  });

  it.each(['draft', 'pending', 'future', 'private'])('is a 404 when %s', async (status) => {
    respond({ post: post(status) });
    const { getPostBySlug } = await import('./service');

    expect(await getPostBySlug('a-post')).toBeNull();
  });
});

describe('the preview request', () => {
  it('signs in as the previewer, asks for the draft, and is never cached', async () => {
    vi.stubEnv('WORDPRESS_AUTH_TOKEN', 'legacy-token');
    const { fetchPreviewGraphQL } = await import('./client');
    await fetchPreviewGraphQL('query { post { id } }', { id: '42' }, 42);

    const init = fetchMock.mock.calls[0][1];
    expect(sentHeaders().Authorization).toBe(
      `Basic ${Buffer.from('previewer:abcd efgh ijkl').toString('base64')}`
    );
    expect(sentHeaders()['X-GraphQL-Preview']).toBe('database_id=42');
    expect(init.cache).toBe('no-store');
    expect(init).not.toHaveProperty('next');
  });

  it('refuses to run without the previewer configured', async () => {
    vi.stubEnv('WORDPRESS_PREVIEW_APP_PASSWORD', '');
    const { fetchPreviewGraphQL, isPreviewConfigured } = await import('./client');

    expect(isPreviewConfigured()).toBe(false);
    await expect(fetchPreviewGraphQL('query { post { id } }', {}, 42)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
