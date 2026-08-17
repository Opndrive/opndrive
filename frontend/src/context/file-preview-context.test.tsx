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
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FilePreviewProvider, useFilePreview, PREVIEW_PARAM } from './file-preview-context';
import { useDriveStore } from './data-context';
import type { PreviewableFile } from '@/types/file-preview';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

/** Stands in for the address bar, so a test can put the app on any URL. */
const url = vi.hoisted(() => ({ pathname: '/dashboard/browse', query: 'prefix=docs%2F' }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => url.pathname,
  useSearchParams: () => new URLSearchParams(url.query),
}));

const fetchMetadata = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ apiS3: null as unknown }));

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));

const report: PreviewableFile = { id: 'a', name: 'report.pdf', key: 'docs/report.pdf', size: 1 };
const notes: PreviewableFile = { id: 'b', name: 'notes.txt', key: 'docs/notes.txt', size: 2 };

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

beforeEach(() => {
  vi.clearAllMocks();
  url.pathname = '/dashboard/browse';
  url.query = 'prefix=docs%2F';
  auth.apiS3 = null;
  useDriveStore.setState({ currentPrefix: null, cache: {} });
});

describe('what the preview writes to the URL', () => {
  it('puts the file in the address bar without losing the folder', async () => {
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });

    // The folder context has to survive, or closing the preview would strand
    // the user somewhere other than where they opened it.
    expect(router.push).toHaveBeenCalledWith(
      '/dashboard/browse?prefix=docs%2F&preview=docs%2Freport.pdf',
      { scroll: false }
    );
  });

  it('replaces rather than pushes while arrowing between files', async () => {
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
    mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });
    router.push.mockClear();

    await act(async () => {
      preview.navigateNext();
    });

    // Twenty files browsed must not put twenty entries between the user and
    // the folder they started in.
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      '/dashboard/browse?prefix=docs%2F&preview=docs%2Fnotes.txt',
      { scroll: false }
    );
  });

  it('goes back on close, consuming the entry it added', async () => {
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
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
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
    mount();

    await act(async () => {
      preview.closePreview();
    });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/dashboard/browse?prefix=docs%2F', {
      scroll: false,
    });
  });
});

describe('what the preview reads back out of the URL', () => {
  it('is closed when the parameter is absent', () => {
    mount();
    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('is open when the parameter is present', () => {
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
    mount();
    expect(screen.getByTestId('open').textContent).toBe('true');
  });

  it('closes when Back removes the parameter', async () => {
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
    const { rerender } = mount();
    expect(screen.getByTestId('open').textContent).toBe('true');

    // What Back does: the URL changes underneath the app. Nothing dispatches a
    // close, so if state were kept separately the modal would stay up.
    url.query = 'prefix=docs%2F';
    await act(async () => {
      rerender(
        <FilePreviewProvider>
          <Probe />
        </FilePreviewProvider>
      );
    });

    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('follows the parameter when it points at another file in the list', async () => {
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
    const { rerender } = mount();
    await act(async () => {
      preview.openPreview(report, [report, notes]);
    });
    expect(preview.file?.name).toBe('report.pdf');

    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Fnotes.txt`;
    await act(async () => {
      rerender(
        <FilePreviewProvider>
          <Probe />
        </FilePreviewProvider>
      );
    });

    expect(preview.file?.name).toBe('notes.txt');
    expect(preview.currentIndex).toBe(1);
  });
});

describe('a preview reached by link or reload', () => {
  const metadata = { ContentLength: 4096, ETag: '"abc"', LastModified: new Date('2026-01-01') };

  function landOnPreview() {
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
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
    url.query = `prefix=docs%2F&${PREVIEW_PARAM}=docs%2Freport.pdf`;
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
