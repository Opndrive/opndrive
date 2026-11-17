/**
 * Thumbnail URLs.
 *
 * The point is that the same image gets the same URL, so the browser's cache
 * can do its job. Each test counts how often a URL was signed, because a fresh
 * signature is a fresh URL, and a fresh URL is another download.
 */

import { describe, it, expect, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { thumbnailUrlFor } from './thumbnail-urls';

function provider() {
  let n = 0;
  const getSignedUrl = vi.fn(
    async (params: { key: string }) => `https://s3/${params.key}?sig=${++n}`
  );
  return { api: { getSignedUrl } as unknown as BYOS3ApiProvider, getSignedUrl };
}

const HOUR = 60 * 60 * 1000;
const t0 = Date.UTC(2026, 10, 17, 12);

describe('thumbnailUrlFor', () => {
  it('hands out the same URL for the same image', async () => {
    const { api, getSignedUrl } = provider();

    const first = await thumbnailUrlFor(api, { key: 'photos/a.jpg', version: '"e1"' }, t0);
    const second = await thumbnailUrlFor(
      api,
      { key: 'photos/a.jpg', version: '"e1"' },
      t0 + 10_000
    );

    expect(second).toBe(first);
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it('shares one signing between tiles that ask at the same moment', async () => {
    const { api, getSignedUrl } = provider();

    const [a, b] = await Promise.all([
      thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0),
      thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0),
    ]);

    expect(a).toBe(b);
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it('signs anew for a new version of the image at the same key', async () => {
    // Replaced with "keep both: no, replace": same key, different content.
    const { api, getSignedUrl } = provider();

    const before = await thumbnailUrlFor(api, { key: 'photos/a.jpg', version: '"e1"' }, t0);
    const after = await thumbnailUrlFor(api, { key: 'photos/a.jpg', version: '"e2"' }, t0);

    expect(after).not.toBe(before);
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps URLs apart between providers, as between sessions or buckets', async () => {
    const one = provider();
    const two = provider();

    await thumbnailUrlFor(one.api, { key: 'photos/a.jpg' }, t0);
    await thumbnailUrlFor(two.api, { key: 'photos/a.jpg' }, t0);

    expect(one.getSignedUrl).toHaveBeenCalledOnce();
    expect(two.getSignedUrl).toHaveBeenCalledOnce();
  });

  it('replaces a URL shortly before it would expire', async () => {
    const { api, getSignedUrl } = provider();

    const first = await thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0);
    const stillGood = await thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0 + HOUR - 6 * 60_000);
    const renewed = await thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0 + HOUR - 4 * 60_000);

    expect(stillGood).toBe(first);
    expect(renewed).not.toBe(first);
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('asks for an inline image the browser may keep while the URL lasts', async () => {
    const { api, getSignedUrl } = provider();

    await thumbnailUrlFor(api, { key: 'photos/a.png' }, t0);

    expect(getSignedUrl).toHaveBeenCalledWith({
      key: 'photos/a.png',
      expiryInSeconds: 3600,
      isPreview: true,
      responseContentType: 'image/png',
      responseCacheControl: 'private, max-age=3600',
    });
  });

  it('does not remember a signing that failed', async () => {
    const { api, getSignedUrl } = provider();
    getSignedUrl.mockRejectedValueOnce(new Error('credentials expired'));

    await expect(thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0)).rejects.toThrow(
      'credentials expired'
    );
    await expect(thumbnailUrlFor(api, { key: 'photos/a.jpg' }, t0)).resolves.toContain('sig=');

    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });
});
