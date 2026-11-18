/**
 * The grid tile's picture.
 *
 * Three things went wrong here: the size limit was compared against the
 * display number rather than bytes, so no image was ever too big for a tile;
 * every mount signed a new URL, so nothing was ever served from cache; and the
 * effect sat after two early returns, so the hook count changed as soon as
 * authentication finished.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { FileItem } from '@/features/dashboard/types/file';

const session = vi.hoisted(() => ({
  current: { apiS3: null as unknown, isLoading: false, isAuthenticated: true },
}));
vi.mock('@/hooks/use-auth-guard', () => ({ useAuthGuard: () => session.current }));

import { FileThumbnailWithImage } from './file-thumbnail-with-image';

let signed = 0;
const getSignedUrl = vi.fn(async ({ key }: { key: string }) => `https://s3/${key}?sig=${++signed}`);

beforeEach(() => {
  signed = 0;
  getSignedUrl.mockClear();
  // A fresh provider per test, so URLs cached by one test do not leak into
  // the next.
  session.current = { apiS3: { getSignedUrl }, isLoading: false, isAuthenticated: true };
});

const MB = 1024 * 1024;

function image(name: string, bytes: number, display: FileItem['size']): FileItem {
  return {
    id: `photos/${name}`,
    Key: `photos/${name}`,
    Size: bytes,
    ETag: '"etag-1"',
    name,
    extension: name.split('.').pop()!,
    size: display,
  };
}

const tile = (file: FileItem) => (
  <FileThumbnailWithImage extension="jpg" name={file.name} file={file} />
);

describe('which images get a picture', () => {
  it('shows an image small enough for a tile', async () => {
    render(tile(image('small.jpg', 300 * 1024, { value: 300, unit: 'KB' })));

    expect(await screen.findByRole('img', { name: 'small.jpg' })).toBeTruthy();
  });

  it('shows the icon for an image too big to fetch for a tile', async () => {
    // 400 MB displays as { value: 400, unit: 'MB' }. Compared with a limit in
    // bytes, 400 passed, and the tile downloaded all 400 MB.
    render(tile(image('huge.jpg', 400 * MB, { value: 400, unit: 'MB' })));

    await Promise.resolve();
    expect(screen.queryByRole('img')).toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('shows the icon when the size is not known', async () => {
    const file = { ...image('a.jpg', 1, { value: 1, unit: 'B' }), Size: undefined };
    render(tile(file));

    await Promise.resolve();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('falls back to the icon when the image will not load, even on a fresh URL', async () => {
    render(tile(image('broken.jpg', MB, { value: 1, unit: 'MB' })));

    fireEvent.error(await screen.findByRole('img'));
    // The icon while a fresh URL is signed, in case the first had expired.
    expect(screen.queryByRole('img')).toBeNull();
    const retried = await screen.findByRole('img');
    expect(retried.getAttribute('src')).toContain('sig=2');

    fireEvent.error(retried);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Once is enough: an image that is not one fails on every URL.
    expect(screen.queryByRole('img')).toBeNull();
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });
});

describe('a URL that has expired by the time the image loads', () => {
  // Tiles load their image when scrolled into view, which can be long after
  // the URL was handed out. An expired one failed, and the tile showed its
  // icon until it was mounted again, and was then handed the same dead URL.

  it('signs a fresh one and loads the image from it', async () => {
    render(tile(image('a.jpg', MB, { value: 1, unit: 'MB' })));
    const expired = await screen.findByRole('img');
    expect(expired.getAttribute('src')).toContain('sig=1');

    fireEvent.error(expired);

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'a.jpg' }).getAttribute('src')).toContain('sig=2')
    );
  });

  it('hands the fresh one to the next tile, not the dead one', async () => {
    const file = image('a.jpg', MB, { value: 1, unit: 'MB' });
    const first = render(tile(file));
    fireEvent.error(await screen.findByRole('img'));
    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toContain('sig=2'));
    first.unmount();

    render(tile(file));

    expect((await screen.findByRole('img')).getAttribute('src')).toContain('sig=2');
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('waits for a different URL when the fresh one comes out the same', async () => {
    // A presigned URL changes only with the second it was signed in. Signed
    // again within the same second, the "fresh" URL was the one that had
    // just failed, and the tile kept its icon.
    getSignedUrl
      .mockImplementationOnce(async ({ key }) => `https://s3/${key}?sig=same`)
      .mockImplementationOnce(async ({ key }) => `https://s3/${key}?sig=same`);
    render(tile(image('a.jpg', MB, { value: 1, unit: 'MB' })));

    fireEvent.error(await screen.findByRole('img'));

    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toContain('sig=1'), {
      timeout: 3000,
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(3);
  });

  it('never puts the old file back in a tile reused for another meanwhile', async () => {
    const { rerender } = render(tile(image('a.jpg', MB, { value: 1, unit: 'MB' })));
    fireEvent.error(await screen.findByRole('img', { name: 'a.jpg' }));

    rerender(tile(image('b.jpg', MB, { value: 1, unit: 'MB' })));

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'b.jpg' }).getAttribute('src')).toContain(
        'photos/b.jpg'
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('img').getAttribute('src')).toContain('photos/b.jpg');
  });
});

describe('caching', () => {
  it('gives the same image the same URL each time a tile mounts', async () => {
    const file = image('a.jpg', MB, { value: 1, unit: 'MB' });

    const first = render(tile(file));
    const src = (await screen.findByRole('img')).getAttribute('src');
    first.unmount();

    render(tile(file));
    const again = (await screen.findByRole('img')).getAttribute('src');

    // Same URL, so the browser serves it from cache instead of downloading
    // the image again.
    expect(again).toBe(src);
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it('lazy-loads and decodes off the main thread', async () => {
    render(tile(image('a.jpg', MB, { value: 1, unit: 'MB' })));

    const img = await screen.findByRole('img');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('never shows the previous file in a tile reused for another', async () => {
    const { rerender } = render(tile(image('a.jpg', MB, { value: 1, unit: 'MB' })));
    await screen.findByRole('img', { name: 'a.jpg' });

    rerender(tile(image('b.jpg', MB, { value: 1, unit: 'MB' })));

    // Either the icon or b.jpg, never a.jpg's picture under b.jpg's name.
    const shown = screen.queryByRole('img');
    if (shown) expect(shown.getAttribute('src')).toContain('photos/b.jpg');
    await waitFor(() =>
      expect(screen.getByRole('img').getAttribute('src')).toContain('photos/b.jpg')
    );
  });
});

describe('hook order', () => {
  it('renders through authentication finishing without a hook count change', async () => {
    session.current = { apiS3: null, isLoading: true, isAuthenticated: false };
    const file = image('a.jpg', MB, { value: 1, unit: 'MB' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(tile(file));
    expect(screen.getByText('Authenticating...')).toBeTruthy();

    session.current = { apiS3: { getSignedUrl }, isLoading: false, isAuthenticated: true };
    rerender(tile(file));

    expect(await screen.findByRole('img')).toBeTruthy();
    // React reports a changed hook count through console.error.
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/hooks/i);
    errors.mockRestore();
  });
});
