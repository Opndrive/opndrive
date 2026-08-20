/**
 * The preview modal's URL.
 *
 * Opening a preview used to change nothing in the address bar, so Back did not
 * close it - it left the folder the user was browsing, and since folder
 * navigation does push URLs they could land several folders back or off the
 * dashboard entirely.
 *
 * The parameter is now the state, so these cover both directions: what the
 * preview writes to the URL, and what it reads back out of it.
 *
 * It writes to the hash rather than the query string, because the value is an
 * S3 object key and a query string is transmitted. That is also why these drive
 * the real jsdom history instead of a mocked `useSearchParams`: the behaviour
 * under test is the history API's now, and a mock would prove nothing about it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FilePreviewProvider, useFilePreview, PREVIEW_PARAM } from './file-preview-context';
import { useDriveStore } from './data-context';
import type { PreviewableFile } from '@/types/file-preview';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const fetchMetadata = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ apiS3: null as unknown }));

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));

const report: PreviewableFile = { id: 'a', name: 'report.pdf', key: 'docs/report.pdf', size: 1 };
const notes: PreviewableFile = { id: 'b', name: 'notes.txt', key: 'docs/notes.txt', size: 2 };

/** The folder the user is browsing, with no preview open. */
const FOLDER = '/dashboard/browse?prefix=docs%2F';

/** Puts the app on a URL without going through the app. */
function goTo(url: string) {
  window.history.replaceState(null, '', url);
}

/** What Back does: the URL changes underneath the app, unannounced. */
async function popTo(url: string) {
  await act(async () => {
    goTo(url);
    window.dispatchEvent(new Event('popstate'));
  });
}

/** The address bar as the user sees it. */
function currentUrl() {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

let preview: ReturnType<typeof useFilePreview>;

function Probe() {
  preview = useFilePreview();
  return <span data-testid="open">{String(preview.isOpen)}</span>;
}

function mount() {
  return render(
    <FilePreviewProvider>
      <Probe />
    </FilePreviewProvider>
  );
}

let pushState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  goTo(FOLDER);
  pushState = vi.spyOn(window.history, 'pushState');
  auth.apiS3 = null;
  useDriveStore.setState({ currentPrefix: null, cache: {} });
});

afterEach(() => {
  pushState.mockRestore();
  goTo('/');
});

describe('what the preview writes to the URL', () => {
  it('puts the file in the address bar without losing the folder', async () => {
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });

    // The folder context has to survive, or closing the preview would strand
    // the user somewhere other than where they opened it.
    expect(currentUrl()).toBe('/dashboard/browse?prefix=docs%2F#preview=docs%2Freport.pdf');
  });

  it('keeps the key out of the query string, which is the part that is sent', async () => {
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });

    expect(window.location.search).toBe('?prefix=docs%2F');
    expect(window.location.search).not.toContain('report.pdf');
  });

  it('adds a history entry so Back has something to close', async () => {
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('replaces rather than pushes while arrowing between files', async () => {
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });
    pushState.mockClear();

    await act(async () => {
      preview.navigateNext();
    });

    // Twenty files browsed must not put twenty entries between the user and
    // the folder they started in.
    expect(pushState).not.toHaveBeenCalled();
    expect(currentUrl()).toBe('/dashboard/browse?prefix=docs%2F#preview=docs%2Fnotes.txt');
  });

  it('goes back on close, consuming the entry it added', async () => {
    // Starts closed, the way a user opening a preview from a folder does.
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });

    await act(async () => {
      preview.closePreview();
    });

    expect(router.back).toHaveBeenCalled();
  });

  it('rewrites the URL on close when it was reached by a link', async () => {
    // Landed here directly, so there is no preview entry to step back to and
    // going back would leave the app.
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    mount();

    await act(async () => {
      preview.closePreview();
    });

    expect(router.back).not.toHaveBeenCalled();
    expect(currentUrl()).toBe(FOLDER);
  });
});

describe('what the preview reads back out of the URL', () => {
  it('is closed when the parameter is absent', () => {
    mount();
    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('is open when the parameter is present', () => {
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    mount();
    expect(screen.getByTestId('open').textContent).toBe('true');
  });

  it('closes when Back removes the parameter', async () => {
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    mount();
    expect(screen.getByTestId('open').textContent).toBe('true');

    // Nothing dispatches a close, so if the state were kept separately the
    // modal would stay up.
    await popTo(FOLDER);

    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('follows the parameter when it points at another file in the list', async () => {
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });
    expect(preview.file?.name).toBe('report.pdf');

    await popTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Fnotes.txt`);

    expect(preview.file?.name).toBe('notes.txt');
    expect(preview.currentIndex).toBe(1);
  });
});

describe('a preview reached by link or reload', () => {
  const metadata = { ContentLength: 4096, ETag: '"abc"', LastModified: new Date('2026-01-01') };

  function landOnPreview() {
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    auth.apiS3 = { fetchMetadata };
  }

  it('fetches the one file it points at, without waiting for the listing', async () => {
    landOnPreview();
    fetchMetadata.mockResolvedValue(metadata);

    await act(async () => {
      mount();
    });

    // The listing has not arrived, and the user still sees their file.
    expect(fetchMetadata).toHaveBeenCalledWith('docs/report.pdf');
    expect(preview.file?.name).toBe('report.pdf');
    expect(preview.file?.size).toBe(4096);
    expect(preview.isOpen).toBe(true);
  });

  it('has no neighbours to arrow through until the listing lands', async () => {
    landOnPreview();
    fetchMetadata.mockResolvedValue(metadata);

    await act(async () => {
      mount();
    });

    expect(preview.files).toHaveLength(0);
  });

  it('picks up its neighbours once the folder listing arrives', async () => {
    landOnPreview();
    fetchMetadata.mockResolvedValue(metadata);

    await act(async () => {
      mount();
    });

    // What the browse page does a moment later.
    await act(async () => {
      useDriveStore.setState({
        currentPrefix: 'docs/',
        cache: {
          'docs/': {
            files: [
              { id: 'a', name: 'report.pdf', Key: 'docs/report.pdf', extension: 'pdf' },
              { id: 'b', name: 'notes.txt', Key: 'docs/notes.txt', extension: 'txt' },
            ],
            folders: [],
            isTruncated: false,
          },
        },
      } as never);
    });

    expect(preview.files).toHaveLength(2);
    expect(preview.currentIndex).toBe(0);
  });

  it('still opens when the bucket refuses the metadata call', async () => {
    landOnPreview();
    // What a bucket that allows GET but not HEAD looks like from here: the
    // client swallows it and hands back null. Listing and the viewer's signed
    // URL are both fine, so refusing to open would be wrong.
    fetchMetadata.mockResolvedValue(null);

    await act(async () => {
      mount();
    });

    expect(preview.isOpen).toBe(true);
    expect(preview.file?.name).toBe('report.pdf');
    expect(preview.file?.key).toBe('docs/report.pdf');
  });

  it('still opens when the metadata call throws', async () => {
    landOnPreview();
    fetchMetadata.mockRejectedValue(new Error('CORS'));

    await act(async () => {
      mount();
    });

    expect(preview.isOpen).toBe(true);
    expect(preview.file?.name).toBe('report.pdf');
  });

  it('opens before the metadata call has answered', async () => {
    landOnPreview();
    // Never settles, standing in for a slow or hanging request.
    fetchMetadata.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      mount();
    });

    // The file has to be on screen already, not behind a spinner waiting on a
    // call that only supplies its size.
    expect(preview.file?.name).toBe('report.pdf');
  });

  it('opens even with no S3 client yet', async () => {
    goTo(`${FOLDER}#${PREVIEW_PARAM}=docs%2Freport.pdf`);
    auth.apiS3 = null;

    await act(async () => {
      mount();
    });

    expect(preview.isOpen).toBe(true);
    expect(preview.file?.name).toBe('report.pdf');
  });

  it('takes the real size once metadata arrives', async () => {
    landOnPreview();
    fetchMetadata.mockResolvedValue(metadata);

    await act(async () => {
      mount();
    });

    // Which is what makes the size limit check mean anything.
    expect(preview.file?.size).toBe(4096);
  });

  it('does not fetch when the listing already covers the file', async () => {
    landOnPreview();
    fetchMetadata.mockResolvedValue(metadata);

    await act(async () => {
      mount();
    });
    fetchMetadata.mockClear();

    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });

    expect(fetchMetadata).not.toHaveBeenCalled();
  });
});

describe('edges that would leave the preview stuck or bogus', () => {
  it('treats an empty parameter as no preview', () => {
    // Reachable by hand-editing the URL, or by anything that builds the link
    // from a key it never got. Opening a file called "unknown" is worse than
    // not opening at all.
    goTo(`${FOLDER}#preview=`);
    mount();

    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('does not stack history when the same file is opened twice', async () => {
    mount();

    // Preview opens on double click, so a second one landing before the modal
    // covers the row is an ordinary thing to do.
    await act(async () => {
      preview.openPreview(report, [report, notes]);
      preview.openPreview(report, [report, notes]);
    });

    // Two entries for one preview means the first close just re-shows it, and
    // the user has to close twice.
    expect(pushState).toHaveBeenCalledTimes(1);
  });
});
