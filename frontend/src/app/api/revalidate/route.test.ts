/**
 * The publish webhook: refuses anything without the secret, and refreshes
 * every cached view of the blog when a post changes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/cache', () => cache);

const SECRET = 'the-revalidate-secret-for-tests';

async function load() {
  vi.resetModules();
  vi.stubEnv('REVALIDATE_SECRET', SECRET);
  return import('./route');
}

function request(body: unknown, token: string | null = SECRET) {
  return new NextRequest('https://opndrive.app/api/revalidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { 'x-revalidate-token': token }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  cache.revalidateTag.mockClear();
  cache.revalidatePath.mockClear();
});

describe('who may call it', () => {
  it('refuses a request without the token', async () => {
    const { POST } = await load();
    expect((await POST(request({ type: 'all' }, null))).status).toBe(401);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });

  it('refuses a wrong token', async () => {
    const { POST } = await load();
    expect((await POST(request({ type: 'all' }, `${SECRET}x`))).status).toBe(401);
  });

  it('answers 500 rather than accepting anything when no secret is configured', async () => {
    vi.resetModules();
    vi.stubEnv('REVALIDATE_SECRET', '');
    const { POST } = await import('./route');
    expect((await POST(request({ type: 'all' }, ''))).status).toBe(500);
  });

  it('has no GET, which used to take the secret in the URL', async () => {
    const route = await load();
    expect('GET' in route).toBe(false);
  });
});

describe('what it refreshes', () => {
  it('refreshes the post, the index, the feed and the sitemap when a post changes', async () => {
    const { POST } = await load();
    const response = await POST(request({ type: 'post', slug: 'a-post' }));

    expect(response.status).toBe(200);
    expect(cache.revalidateTag).toHaveBeenCalledWith('posts');
    expect(cache.revalidateTag).toHaveBeenCalledWith('post-a-post');
    for (const path of ['/blog/a-post', '/blog', '/blog/rss.xml', '/sitemap.xml']) {
      expect(cache.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it.each(['../../etc', 'a/b', '', 'x'.repeat(201)])('refuses the slug %j', async (slug) => {
    const { POST } = await load();
    expect((await POST(request({ type: 'post', slug }))).status).toBe(400);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON, an unknown type and odd tags', async () => {
    const { POST } = await load();
    expect((await POST(request('not json'))).status).toBe(400);
    expect((await POST(request({ type: 'everything' }))).status).toBe(400);
    expect((await POST(request({ type: 'all', tags: ['ok', 'not ok'] }))).status).toBe(400);
  });
});

describe('the sitemap', () => {
  // Refreshing `posts` only reaches the sitemap if its request carries the tag.
  it('is fetched with the posts tag', () => {
    const service = readFileSync(
      join(process.cwd(), 'src', 'lib', 'wordpress', 'service.ts'),
      'utf8'
    );
    const sitemap = service.slice(service.indexOf('export async function getAllPostSitemapData'));
    expect(sitemap.slice(0, 1500)).toContain("tags: ['posts']");
  });
});

describe('the WordPress plugin that calls it', () => {
  const plugin = readFileSync(
    join(process.cwd(), '..', 'wordpress', 'mu-plugins', 'opndrive-revalidate.php'),
    'utf8'
  );

  it('sends the header, the path and the body this route reads', () => {
    expect(plugin).toContain("'x-revalidate-token' => OPNDRIVE_REVALIDATE_SECRET");
    expect(plugin).toContain("'api/revalidate'");
    expect(plugin).toMatch(/'type' => 'post'/);
    expect(plugin).toMatch(/'slug' => \$slug/);
  });

  it('keeps the secret in wp-config.php, not in the plugin', () => {
    expect(plugin).not.toMatch(/define\(\s*'OPNDRIVE_REVALIDATE_SECRET'\s*,\s*'[^']*[a-z0-9]{16}/i);
  });
});
