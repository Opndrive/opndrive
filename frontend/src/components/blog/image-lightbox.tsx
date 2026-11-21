'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface LightboxImage {
  src: string;
  alt: string;
  /** The picture's own size, which sets how large the lightbox draws it. */
  width: number;
  height: number;
  /** Where focus goes back to on closing: the button that opened it. */
  trigger: HTMLElement;
}

/**
 * How wide to draw a picture of `natural` pixels: at least its own width, and
 * up to twice that (no more than 1200px) for a small one. "View larger" has
 * to mean larger: a 488px diagram is already shown wider than that in the
 * post's column, and the lightbox showing it at 488 would be a step down.
 */
export function lightboxWidth(natural: number): number {
  return Math.max(natural, Math.min(natural * 2, 1200));
}

interface ImageLightboxProps {
  /**
   * The picture last opened. It stays set after closing, so the dialog can
   * animate out with it and hand focus back to its button.
   */
  image: LightboxImage | null;
  open: boolean;
  onClose: () => void;
}

/**
 * A post's picture at full size, over the page.
 *
 * Radix's dialog holds focus inside while it is open, closes on Escape or a
 * press outside the picture, and keeps the page from scrolling under it. A
 * picture wider than the window is fitted to it; a tall one (a long diagram)
 * keeps its own size and scrolls, rather than shrinking until its text is
 * unreadable.
 */
export function ImageLightbox({ image, open, onClose }: ImageLightboxProps) {
  return (
    <Dialog.Root
      open={open && image !== null}
      onOpenChange={(next) => (next ? undefined : onClose())}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/85" />
        <Dialog.Content
          // Closing puts focus back on the picture's button; without a Radix
          // trigger it would otherwise land on the page itself.
          onCloseAutoFocus={(event) => {
            if (image?.trigger.isConnected) {
              event.preventDefault();
              image.trigger.focus();
            }
          }}
          className="fixed inset-0 z-50 overflow-auto overscroll-contain outline-none"
          onClick={(event) => {
            // A press on the backdrop around the picture closes it.
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <Dialog.Title className="sr-only">{image?.alt || 'Image'}</Dialog.Title>
          <Dialog.Description className="sr-only">
            The picture at full size. Press Escape to close.
          </Dialog.Description>

          {image ? (
            <div
              className="flex min-h-full items-center justify-center p-4 sm:p-10"
              onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
              }}
            >
              {/* A plain <img>: the post's own picture, at its own address and
                  size, rather than a resized copy from the image optimiser. */}
              <img
                src={image.src}
                alt={image.alt}
                width={image.width || undefined}
                height={image.height || undefined}
                className="h-auto max-w-full rounded-lg bg-white shadow-2xl"
                style={
                  image.width ? { width: `min(100%, ${lightboxWidth(image.width)}px)` } : undefined
                }
              />
            </div>
          ) : null}

          <Dialog.Close
            aria-label="Close"
            className="fixed right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
