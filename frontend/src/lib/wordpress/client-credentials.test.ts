/**
 * Which WordPress requests sign in. The public blog never does, so it can only
 * ever be answered with published posts. The preview does, never cached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_ENABLE_BLOG', 'true');
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://cms.example/graphql');
  vi.stubEnv('WORDPRESS_AUTH_TOKEN', 'an-old-token-that-must-not-be-sent');
  vi.stubEnv('WORDPRESS_PREVIEW_USER', 'previewer');
  vi.stubEnv('WORDPRESS_PREVIEW_APP_PASSWORD', 'abcd efgh ijkl');
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { post: null } })));
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
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('an-old-token');
  });
});

describe('the preview request', () => {
  it('signs in as the previewer, asks for the draft, and is never cached', async () => {
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
