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

  it('falls back to the icon when the image will not load', async () => {
    render(tile(image('broken.jpg', MB, { value: 1, unit: 'MB' })));

    fireEvent.error(await screen.findByRole('img'));

    expect(screen.queryByRole('img')).toBeNull();
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
