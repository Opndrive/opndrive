'use client';

import { useEffect, useState } from 'react';

/**
 * Whether an element is actually on screen, inside the dashboard's scroll
 * container.
 *
 * Drawn is not the same as on screen: a virtualized list draws rows a few
 * screens beyond what is visible so scrolling never shows a gap. Work worth
 * doing only for what the user can see - fetching an image - waits for this.
 *
 * One observer per scroll container, shared by every element in it, rather
 * than one each: a grid can have a few dozen cards drawn at a time, and each
 * observer is another thing the browser checks on every scroll.
 *
 * Where there is no IntersectionObserver (jsdom), everything counts as on
 * screen, which is what the code did before it asked.
 */
interface Shared {
  observer: IntersectionObserver;
  listeners: Map<Element, (onScreen: boolean) => void>;
}

const byRoot = new Map<Element | null, Shared>();

function sharedFor(root: Element | null): Shared {
  let shared = byRoot.get(root);
  if (!shared) {
    const listeners = new Map<Element, (onScreen: boolean) => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
      },
      { root, threshold: 0 }
    );
    shared = { observer, listeners };
    byRoot.set(root, shared);
  }
  return shared;
}

/**
 * Takes the element itself, from a callback ref, rather than a ref object: an
 * element that mounts after the first render - behind a loading state, say -
 * is then observed when it arrives.
 */
export function useOnScreen(element: Element | null): boolean {
  const supported = typeof IntersectionObserver !== 'undefined';
  const [onScreen, setOnScreen] = useState(!supported);

  useEffect(() => {
    if (!element || !supported) return;

    const root = element.closest('main');
    const shared = sharedFor(root);
    shared.listeners.set(element, setOnScreen);
    shared.observer.observe(element);

    return () => {
      shared.observer.unobserve(element);
      shared.listeners.delete(element);
      if (shared.listeners.size === 0) {
        shared.observer.disconnect();
        byRoot.delete(root);
      }
    };
  }, [element, supported]);

  return onScreen;
}
