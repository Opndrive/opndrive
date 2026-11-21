/**
 * Opening a post's picture larger, and passing the post on.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlogPostContent } from './blog-post-content';
import { ShareButtons } from './share-buttons';
import { largestSource } from './image-source';
import { lightboxWidth } from './image-lightbox';
import { renderPostContent } from '@/lib/blog-content/render';
import { wasUpdatedAfterPublishing } from '@/lib/wordpress/utils';

function parse(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('pictures in a post', () => {
  it('load lazily and sit in a button that names what it opens', async () => {
    const root = parse(
      (
        await renderPostContent(
          '<figure><img src="/flow.png" alt="Flowchart of the checks"></figure>'
        )
      ).html
    );

    const button = root.querySelector('figure > button[data-image-zoom]');
    expect(button?.getAttribute('aria-label')).toBe('View larger: Flowchart of the checks');
    const img = button?.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
  });

  it('keep a loading choice the author made, and get a plain label without alt text', async () => {
    const root = parse((await renderPostContent('<p><img src="/a.png" loading="eager"></p>')).html);

    expect(root.querySelector('img')?.getAttribute('loading')).toBe('eager');
    expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('View image larger');
  });

  it('that are links already go where their link goes', async () => {
    const root = parse(
      (await renderPostContent('<a href="/x"><img src="/a.png" alt="A"></a>')).html
    );

    expect(root.querySelector('[data-image-zoom]')).toBeNull();
    expect(root.querySelector('a > img')).not.toBeNull();
  });
});

describe('the picture lightbox', () => {
  let html: string;

  beforeAll(async () => {
    html = (await renderPostContent('<p><img src="/flow.png" alt="Flowchart"></p>')).html;
  });

  it('opens the picture in a dialog and hands focus back on closing', async () => {
    render(<BlogPostContent html={html} />);
    const button = screen.getByRole('button', { name: 'View larger: Flowchart' });

    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog');
    // currentSrc/src read back absolute, against the test page's origin.
    expect(dialog.querySelector('img')?.getAttribute('src')).toMatch(/\/flow\.png$/);
    expect(screen.getByRole('heading', { name: 'Flowchart', hidden: true })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});

describe('largestSource', () => {
  it('picks the widest srcset entry, or what the picture shows', () => {
    const img = document.createElement('img');
    img.src = 'https://wp.example/a-300.png';
    expect(largestSource(img)).toBe('https://wp.example/a-300.png');

    img.setAttribute(
      'srcset',
      'https://wp.example/a-300.png 300w, https://wp.example/a-1600.png 1600w, https://wp.example/a-768.png 768w'
    );
    expect(largestSource(img)).toBe('https://wp.example/a-1600.png');
  });
});

describe('lightboxWidth', () => {
  it('draws a small picture up to twice its size, a large one at its own', () => {
    expect(lightboxWidth(488)).toBe(976);
    expect(lightboxWidth(800)).toBe(1200);
    expect(lightboxWidth(1600)).toBe(1600);
  });
});

describe('ShareButtons', () => {
  const url = 'https://opndrive.app/blog/fix-signature?x=1';
  const title = 'Fix SignatureDoesNotMatch & more';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies the post link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareButtons url={url} title={title} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('links to each site with the address and title encoded, in a new tab', () => {
    render(<ShareButtons url={url} title={title} />);

    const x = screen.getByRole('link', { name: 'Share on X (opens in a new tab)' });
    expect(x.getAttribute('href')).toBe(
      `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
    );
    expect(x.getAttribute('target')).toBe('_blank');
    expect(x.getAttribute('rel')).toBe('noopener noreferrer');
    for (const name of ['LinkedIn', 'Hacker News', 'Reddit']) {
      expect(
        screen.getByRole('link', { name: `Share on ${name} (opens in a new tab)` })
      ).toBeDefined();
    }
  });

  it('offers the device share sheet only where there is one', () => {
    const { unmount } = render(<ShareButtons url={url} title={title} />);
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();
    unmount();

    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<ShareButtons url={url} title={title} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    expect(share).toHaveBeenCalledWith({ title, url });
    Reflect.deleteProperty(navigator, 'share');
  });
});

describe('wasUpdatedAfterPublishing', () => {
  it('is true only for a change on a later day than publishing', () => {
    expect(wasUpdatedAfterPublishing('2026-11-21T09:00:00', '2026-11-22T08:00:00')).toBe(true);
    expect(wasUpdatedAfterPublishing('2026-11-21T09:00:00', '2026-11-21T23:59:00')).toBe(false);
    expect(wasUpdatedAfterPublishing('2026-11-21T09:00:00', '2026-11-20T09:00:00')).toBe(false);
    expect(wasUpdatedAfterPublishing('', '2026-11-22T08:00:00')).toBe(false);
  });
});
