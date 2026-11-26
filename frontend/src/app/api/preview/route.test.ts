/**
 * The preview link: a signed link turns on draft mode and leads to the
 * draft; anything else leads nowhere. The page is tested beside it.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signPreviewLink } from '@/lib/wordpress/preview-link';

const state = vi.hoisted(() => ({
  draftEnabled: false,
  enable: vi.fn(),
  post: null as null | { id: string },
  fail: false,
}));

vi.mock('next/headers', () => ({
  draftMode: async () => ({
    isEnabled: state.draftEnabled,
    enable: state.enable,
    disable: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to });
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/wordpress/service', () => ({
  getPreviewPost: async () => {
    if (state.fail) throw new Error('down');
    return state.post;
  },
}));

const SECRET = 'p'.repeat(40);

function previewRequest(id: number, expires: number, sig = signPreviewLink(id, expires, SECRET)) {
  return new NextRequest(`https://opndrive.app/api/preview?id=${id}&exp=${expires}&sig=${sig}`);
}

const soon = () => Math.floor(Date.now() / 1000) + 600;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_ENABLE_BLOG', 'true');
  vi.stubEnv('WORDPRESS_GRAPHQL_URL', 'https://cms.example/graphql');
  vi.stubEnv('WORDPRESS_PREVIEW_USER', 'previewer');
  vi.stubEnv('WORDPRESS_PREVIEW_APP_PASSWORD', 'xxxx xxxx xxxx');
  vi.stubEnv('BLOG_PREVIEW_SECRET', SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.draftEnabled = false;
  state.post = { id: 'p' };
  state.fail = false;
  state.enable.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('/api/preview', () => {
  it('turns on draft mode and goes to the preview of the signed post', async () => {
    const { GET } = await import('./route');

    await expect(GET(previewRequest(42, soon()))).rejects.toMatchObject({
      to: '/preview/post/42',
    });
    expect(state.enable).toHaveBeenCalledTimes(1);
  });

  it('refuses a forged link, and turns nothing on', async () => {
    const { GET } = await import('./route');
    const response = await GET(previewRequest(42, soon(), 'f'.repeat(64)));

    expect(response.status).toBe(403);
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(state.enable).not.toHaveBeenCalled();
  });

  it('refuses an expired link', async () => {
    const { GET } = await import('./route');
    const response = await GET(previewRequest(42, Math.floor(Date.now() / 1000) - 5));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('expired');
  });

  it('answers 404 when WordPress has no such post', async () => {
    state.post = null;
    const { GET } = await import('./route');

    expect((await GET(previewRequest(42, soon()))).status).toBe(404);
    expect(state.enable).not.toHaveBeenCalled();
  });

  it('answers 502 when WordPress does not answer', async () => {
    state.fail = true;
    const { GET } = await import('./route');

    expect((await GET(previewRequest(42, soon()))).status).toBe(502);
  });

  it('does not exist where previews are not configured', async () => {
    vi.stubEnv('WORDPRESS_PREVIEW_APP_PASSWORD', '');
    const { GET } = await import('./route');

    expect((await GET(previewRequest(42, soon()))).status).toBe(404);
  });
});
