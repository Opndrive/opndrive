'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { LightboxImage } from './image-lightbox';
import { largestSource } from './image-source';

// Loaded the first time a reader opens a picture: most never do, and the
// dialog it needs would otherwise ship with every post.
const ImageLightbox = dynamic(() => import('./image-lightbox').then((mod) => mod.ImageLightbox), {
  ssr: false,
});

const STATUS_VISIBLE_MS = 2000;
const resetTimers = new WeakMap<HTMLElement, number>();

function copyShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C';
}

function showCodeStatus(button: HTMLButtonElement, state: 'copied' | 'selected') {
  const status = button.parentElement?.querySelector('.code-block-copy-status');

  button.dataset.state = state;
  if (status) {
    status.textContent = state === 'copied' ? 'Copied' : `Selected, press ${copyShortcut()}`;
  }

  // A second press inside the window restarts it rather than being cut short
  // by the first press's timer.
  window.clearTimeout(resetTimers.get(button));
  resetTimers.set(
    button,
    window.setTimeout(() => {
      delete button.dataset.state;
      if (status) status.textContent = '';
    }, STATUS_VISIBLE_MS)
  );
}

async function copyCode(button: HTMLButtonElement) {
  const pre = button.closest('.code-block')?.querySelector('pre');
  if (!pre) return;

  // WordPress ends most blocks with a newline. Pasted into a terminal, that
  // newline runs the command before the reader has looked at it.
  const text = (pre.textContent ?? '').replace(/\n+$/, '');

  try {
    await navigator.clipboard.writeText(text);
    showCodeStatus(button, 'copied');
  } catch {
    // No Clipboard API (a plain-http origin) or permission refused. Select
    // the code instead, so the keyboard shortcut is all that is left to do.
    window.getSelection()?.selectAllChildren(pre);
    showCodeStatus(button, 'selected');
  }
}

/**
 * Handles the controls inside a post's HTML with one listener: the copy
 * button on each code block, the link on each section heading, and the
 * button around each picture that opens it larger.
 *
 * Both are part of the post's HTML (see lib/blog-content), not React
 * elements, so they cannot carry handlers of their own. Their clicks bubble
 * up to this wrapper instead.
 */
export function PostContentListener({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState('');
  // The picture last opened, kept after closing so the dialog can animate
  // out with it and give focus back to its button.
  const [zoomed, setZoomed] = useState<LightboxImage | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const announce = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), STATUS_VISIBLE_MS);
  };

  const copySectionLink = async (anchor: HTMLAnchorElement) => {
    // The link goes on as a normal in-page link - the address bar shows the
    // section and the page scrolls to it - and the address is copied as well,
    // which is what a reader pressing a heading's link is after.
    const url = new URL(anchor.getAttribute('href') ?? '', window.location.href).toString();
    try {
      await navigator.clipboard.writeText(url);
      announce('Link to this section copied');
    } catch {
      // The address bar already holds the section's link.
      announce('Link to this section is in the address bar');
    }
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;

    const copyButton = target.closest<HTMLButtonElement>('[data-code-copy]');
    if (copyButton && event.currentTarget.contains(copyButton)) {
      void copyCode(copyButton);
      return;
    }

    const zoom = target.closest<HTMLButtonElement>('[data-image-zoom]');
    const picture = zoom?.querySelector('img');
    if (zoom && picture && event.currentTarget.contains(zoom)) {
      setZoomOpen(true);
      setZoomed({
        src: largestSource(picture),
        alt: picture.alt,
        width: picture.naturalWidth,
        height: picture.naturalHeight,
        trigger: zoom,
      });
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>('[data-heading-anchor]');
    if (anchor && event.currentTarget.contains(anchor)) {
      // A modified click (new tab, new window) is the reader's own.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      void copySectionLink(anchor);
    }
  };

  return (
    <div onClick={handleClick}>
      {children}
      {/* Mounted from the first opening on; never loaded until then. */}
      {zoomed ? (
        <ImageLightbox image={zoomed} open={zoomOpen} onClose={() => setZoomOpen(false)} />
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-opacity duration-200 ${
          toast ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {toast ? (
          <span className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
            {toast}
          </span>
        ) : null}
      </div>
    </div>
  );
}
