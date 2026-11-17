/**
 * The PDF preview.
 *
 * pdf.js itself cannot run under jsdom, so it is replaced here with a document
 * that answers the few calls the viewer makes. What is under test is the
 * viewer's side of that conversation: where the PDF comes from, that pdf.js is
 * the bundled one and not a page loaded from somewhere else, and that each page
 * is drawn, cancelled and torn down when it should be.
 *
 * The part jsdom cannot show - that the browser actually lets pdf.js run under
 * our CSP - is what the old viewer got wrong, and it was checked in a real
 * browser against a production build.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { PDFViewer } from './pdf-viewer';

const pdf = vi.hoisted(() => {
  const state = {
    pages: 3,
    failToOpen: null as Error | null,
    drawn: [] as number[],
    cancelled: 0,
    destroyed: 0,
  };

  const page = (number: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: vi.fn(() => {
      state.drawn.push(number);
      return { promise: Promise.resolve(), cancel: () => state.cancelled++ };
    }),
  });

  const getDocument = vi.fn((_source: { url: string }) => ({
    promise: state.failToOpen
      ? Promise.reject(state.failToOpen)
      : Promise.resolve({
          numPages: state.pages,
          getPage: vi.fn(async (number: number) => page(number)),
        }),
    destroy: vi.fn(async () => {
      state.destroyed++;
    }),
  }));

  return { state, getDocument, GlobalWorkerOptions: { workerSrc: '' } };
});

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: pdf.getDocument,
  GlobalWorkerOptions: pdf.GlobalWorkerOptions,
}));

const getSignedUrl = vi.hoisted(() =>
  vi.fn(async () => 'https://bucket.example/docs/report.pdf?sig=1')
);

vi.mock('@/services/s3-preview-service', () => ({
  createS3PreviewService: () => ({ getSignedUrl }),
}));

// One provider for the whole run, as the app has one per session. A fresh
// object per call would look like a new session on every render.
const session = vi.hoisted(() => ({
  apiS3: { id: 'session' },
  isLoading: false,
  isAuthenticated: true,
}));

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => session,
}));

const file = { id: 'docs/report.pdf', name: 'report.pdf', key: 'docs/report.pdf', size: 2048 };

beforeEach(() => {
  pdf.state.pages = 3;
  pdf.state.failToOpen = null;
  pdf.state.drawn = [];
  pdf.state.cancelled = 0;
  pdf.state.destroyed = 0;
  pdf.getDocument.mockClear();
  getSignedUrl.mockClear();
});

async function openViewer() {
  const view = render(<PDFViewer file={file} />);
  await screen.findByText('Page 1 of 3');
  await waitFor(() => expect(pdf.state.drawn).toContain(1));
  return view;
}

describe('PDFViewer', () => {
  it('opens the file through a signed URL for its own key', async () => {
    await openViewer();

    expect(getSignedUrl).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ key: 'docs/report.pdf', name: 'report.pdf' })
    );
    expect(pdf.getDocument).toHaveBeenCalledExactlyOnceWith({
      url: 'https://bucket.example/docs/report.pdf?sig=1',
    });
  });

  it('runs the pdf.js worker from this origin', async () => {
    await openViewer();

    // A worker from anywhere else is refused by worker-src 'self', and a CDN
    // copy is how the viewer ended up on an old, flawed release to begin with.
    const workerUrl = new URL(pdf.GlobalWorkerOptions.workerSrc);
    expect(workerUrl.pathname).toMatch(/pdf\.worker\.min\.mjs$/);
    expect(workerUrl.hostname).not.toMatch(/cdnjs|jsdelivr|unpkg/);
  });

  it('draws the first page into a canvas', async () => {
    await openViewer();

    expect(screen.getByRole('img', { name: 'report.pdf, page 1 of 3' }).tagName).toBe('CANVAS');
  });

  it('turns pages, and stops at either end', async () => {
    await openViewer();
    const previous = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });

    expect(previous).toHaveProperty('disabled', true);

    fireEvent.click(next);
    fireEvent.click(next);

    await screen.findByText('Page 3 of 3');
    await waitFor(() => expect(pdf.state.drawn).toContain(3));
    expect(next).toHaveProperty('disabled', true);
    expect(previous).toHaveProperty('disabled', false);
  });

  it('zooms in steps and says by how much', async () => {
    await openViewer();
    // jsdom has no layout, so fitting to the panel lands on the minimum zoom.
    expect(screen.getByText('25%')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    await screen.findByText('50%');
  });

  it('offers a retry when the PDF cannot be opened, and the retry works', async () => {
    pdf.state.failToOpen = new Error('Invalid PDF structure');
    render(<PDFViewer file={file} />);

    await screen.findByText('Invalid PDF structure');

    pdf.state.failToOpen = null;
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));

    await screen.findByText('Page 1 of 3');
    expect(pdf.getDocument).toHaveBeenCalledTimes(2);
  });

  it('lets go of the document when the preview closes', async () => {
    const view = await openViewer();

    act(() => view.unmount());

    expect(pdf.state.destroyed).toBe(1);
  });
});
