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
