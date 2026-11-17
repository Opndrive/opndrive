'use client';

/**
 * PDF preview, drawn with the pdf.js that ships in this app's own bundle.
 *
 * It used to put a static `/pdf-viewer.html` in an iframe, and that page loaded
 * pdf.js 3.11.174 from cdnjs. Two things were wrong with it.
 *
 * It never ran. The CSP only lets a script run if it carries the nonce of the
 * request it came with, and a static file has no way to carry one, so in
 * production the browser blocked every script on the page and each PDF sat on
 * "Loading PDF..." for good.
 *
 * And with the CSP off - report-only mode, say - it would have been worse. That
 * page drew whatever PDF its query string named, on the same origin that keeps
 * the user's S3 secret in localStorage, using a pdf.js release in which a
 * crafted PDF can run script.
 *
 * Loaded through the bundle, pdf.js is trusted by the same nonce as the rest of
 * the app, runs its worker from our own origin, and is whatever version the
 * lockfile says. It is only fetched when a PDF is opened.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { PreviewableFile } from '@/types/file-preview';
import { createS3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';
import { useAuthGuard } from '@/hooks/use-auth-guard';

interface PDFViewerProps {
  file: PreviewableFile;
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/** Zoom limits, as multiples of the page's natural size. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

/** Room left either side of the page when fitting it to the panel. */
const FIT_MARGIN_PX = 32;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

let pdfjsLoading: Promise<PdfJs> | null = null;

/**
 * pdf.js, loaded once and on first use.
 *
 * The legacy build, because the modern one assumes the newest browsers and the
 * old viewer worked everywhere. The worker is handed to the bundler as an asset,
 * so it is served from this origin, which is all `worker-src 'self'` allows.
 */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsLoading) {
    pdfjsLoading = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return pdfjs;
    });

    // A failed load must not be cached, or Retry could never work.
    pdfjsLoading.catch(() => {
      pdfjsLoading = null;
    });
  }

  return pdfjsLoading;
}

type DocumentState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: PDFDocumentProxy };

export function PDFViewer({ file }: PDFViewerProps) {
  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();
  const [state, setState] = useState<DocumentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Primitives, so the effect reruns when the file changes and not merely
  // when the object describing it is rebuilt.
  const key = file.key || file.name;
  const name = file.name;

  useEffect(() => {
    if (!apiS3) return;

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setState({ status: 'loading' });

    (async () => {
      try {
        const url = await createS3PreviewService(apiS3).getSignedUrl({
          id: key,
          key,
          name,
          size: 0,
        });
        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        loadingTask = pdfjs.getDocument({ url });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        setState({ status: 'ready', doc });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load PDF',
        });
      }
    })();

    return () => {
      cancelled = true;
      // Tears down the document and its worker messages along with it.
      void loadingTask?.destroy();
    };
  }, [apiS3, key, name, attempt]);

  // Below every hook, so the number of hooks never depends on the session.
  if (isLoading) {
    return <PreviewLoading message="Authenticating..." />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  if (state.status === 'loading') {
    return <PreviewLoading message={`Loading PDF ${name}...`} />;
  }

  if (state.status === 'error') {
    return (
      <PreviewError
        title="PDF Preview Error"
        message={state.message}
        onRetry={() => setAttempt((count) => count + 1)}
      />
    );
  }

  return <PdfPages doc={state.doc} name={name} />;
}

/** One page at a time, with the controls the old viewer had. */
function PdfPages({ doc, name }: { doc: PDFDocumentProxy; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [pageNumber, setPageNumber] = useState(1);
  /** Null means "fit the page to the panel's width". */
  const [zoom, setZoom] = useState<number | null>(null);
  /** The zoom actually drawn, so the label is right while fitting too. */
  const [drawnZoom, setDrawnZoom] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !container || !canvas) return;

      const natural = page.getViewport({ scale: 1 });
      const scale = zoom ?? clampZoom((container.clientWidth - FIT_MARGIN_PX) / natural.width);

      // Drawn at device resolution and shown at CSS size, so text stays sharp
      // on high density screens.
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * ratio });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;

      renderTask = page.render({ canvas, viewport });
      await renderTask.promise;

      if (!cancelled) {
        setDrawnZoom(scale);
        setRenderError(null);
      }
    })().catch((error: unknown) => {
      // Turning a page or zooming cancels the draw in progress. That is not
      // a failure.
      if (cancelled || (error as { name?: string })?.name === 'RenderingCancelledException') {
        return;
      }

      setRenderError(error instanceof Error ? error.message : 'Failed to draw this page');
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, zoom]);

  const pageCount = doc.numPages;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-center gap-2 border-b border-border px-3 py-2 text-sm">
        <button
          type="button"
          className="rounded p-1.5 hover:bg-secondary disabled:opacity-40"
          onClick={() => setPageNumber((page) => page - 1)}
          disabled={pageNumber <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[7rem] text-center tabular-nums" aria-live="polite">
          Page {pageNumber} of {pageCount}
        </span>
        <button
          type="button"
          className="rounded p-1.5 hover:bg-secondary disabled:opacity-40"
          onClick={() => setPageNumber((page) => page + 1)}
          disabled={pageNumber >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <span className="mx-2 h-4 w-px bg-border" aria-hidden />

        <button
          type="button"
          className="rounded p-1.5 hover:bg-secondary disabled:opacity-40"
          onClick={() => setZoom(clampZoom(drawnZoom - ZOOM_STEP))}
          disabled={drawnZoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3.5rem] text-center tabular-nums">
          {Math.round(drawnZoom * 100)}%
        </span>
        <button
          type="button"
          className="rounded p-1.5 hover:bg-secondary disabled:opacity-40"
          onClick={() => setZoom(clampZoom(drawnZoom + ZOOM_STEP))}
          disabled={drawnZoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        {renderError && <PreviewError title="PDF Preview Error" message={renderError} />}
        {/* Always mounted, even while an error shows. Unmounting it would leave
            the next page nothing to draw into, so one bad page would break
            every page after it. */}
        <canvas
          ref={canvasRef}
          className={renderError ? 'hidden' : 'mx-auto block shadow-md'}
          role="img"
          aria-label={`${name}, page ${pageNumber} of ${pageCount}`}
        />
      </div>
    </div>
  );
}
