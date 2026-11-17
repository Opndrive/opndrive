/**
 * The preview viewers, across a session arriving and a retry.
 *
 * Each viewer used to return early while the session loaded and declare its
 * effects after that, so the number of hooks changed the moment sign-in
 * finished - React's "Rendered more hooks than during the previous render".
 * And Retry reset each viewer's state without changing anything its effect
 * depended on, so nothing was fetched again and the viewer sat on "Loading".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

const session = vi.hoisted(() => ({
  current: { apiS3: null as unknown, isLoading: true, isAuthenticated: false },
}));
vi.mock('@/hooks/use-auth-guard', () => ({ useAuthGuard: () => session.current }));

import { CodeViewer } from './code-viewer';
import { ExcelViewer } from './excel-viewer';
import { ImageViewer } from './image-viewer';
import { VideoViewer } from './video-viewer';
import { AudioViewer } from './audio-viewer';

const getSignedUrl = vi.fn(async ({ key }: { key: string }) => `https://s3/${key}`);
const signedIn = () => ({ apiS3: { getSignedUrl }, isLoading: false, isAuthenticated: true });

const file = (name: string) => ({ id: name, name, key: `docs/${name}`, size: 2048 });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getSignedUrl.mockClear();
  session.current = { apiS3: null, isLoading: true, isAuthenticated: false };
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('a,b\n1,2\n'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const hookErrors = () =>
  errors.mock.calls
    .flat()
    .map(String)
    .filter((message) => /hooks|Rendered (more|fewer)/i.test(message));

describe.each([
  ['CodeViewer', (name: string) => <CodeViewer file={file(name)} />, 'notes.txt'],
  ['ExcelViewer', (name: string) => <ExcelViewer file={file(name)} />, 'sheet.csv'],
  ['ImageViewer', (name: string) => <ImageViewer file={file(name)} />, 'photo.png'],
  ['VideoViewer', (name: string) => <VideoViewer file={file(name)} />, 'clip.mp4'],
  ['AudioViewer', (name: string) => <AudioViewer file={file(name)} />, 'song.mp3'],
] as const)('%s', (_, viewer, name) => {
  it('renders through the session arriving without changing its hooks', async () => {
    const { rerender } = render(viewer(name));
    expect(screen.getByText('Authenticating...')).toBeTruthy();

    session.current = signedIn();
    rerender(viewer(name));

    await vi.waitFor(() => expect(getSignedUrl).toHaveBeenCalled());
    expect(hookErrors()).toEqual([]);
  });
});

describe('Retry', () => {
  it.each([
    ['CodeViewer', <CodeViewer key="c" file={file('notes.txt')} />],
    ['ExcelViewer', <ExcelViewer key="e" file={file('sheet.csv')} />],
  ] as const)('%s fetches again instead of staying on loading', async (_, element) => {
    session.current = signedIn();
    getSignedUrl.mockRejectedValueOnce(new Error('network down'));
    render(element);

    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    await vi.waitFor(() => expect(getSignedUrl).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/network down/)).toBeNull();
  });

  it('VideoViewer fetches again too', async () => {
    session.current = signedIn();
    getSignedUrl.mockRejectedValueOnce(new Error('network down'));
    render(<VideoViewer file={file('clip.mp4')} />);

    fireEvent.click(await screen.findByRole('button', { name: /retry/i }));

    await vi.waitFor(() => expect(getSignedUrl).toHaveBeenCalledTimes(2));
  });
});

describe('ImageViewer', () => {
  it('fetches the image once, through the <img> alone', async () => {
    // It used to also create an Image with crossOrigin set "to test the URL",
    // which downloads the whole image a second time.
    const created: unknown[] = [];
    const RealImage = globalThis.Image;
    vi.stubGlobal(
      'Image',
      class extends RealImage {
        constructor() {
          super();
          created.push(this);
        }
      }
    );
    session.current = signedIn();

    render(<ImageViewer file={file('photo.png')} />);
    await screen.findByRole('img', { name: 'photo.png' });

    expect(created).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('zooms on the wheel once the image is showing', async () => {
    // The listener used to be attached on mount, while the viewer was still
    // loading and the container it attaches to did not exist yet.
    session.current = signedIn();
    render(<ImageViewer file={file('photo.png')} />);
    const img = await screen.findByRole('img', { name: 'photo.png' });
    // The scale is applied to the image's wrapper; the wheel lands on the
    // container around it and bubbles up from the image.
    const zoomed = () => img.parentElement!.style.transform;
    expect(zoomed()).toContain('scale(1)');

    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      img.dispatchEvent(wheel);
    });

    expect(zoomed()).toContain('scale(1.1)');
    // Cancelled, so the page behind the preview does not scroll as well.
    expect(wheel.defaultPrevented).toBe(true);
  });
});

void React;
