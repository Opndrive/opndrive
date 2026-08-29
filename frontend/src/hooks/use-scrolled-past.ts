import { useEffect, useState } from 'react';

/**
 * Whether the element with `sentinelId` has scrolled up out of the viewport.
 *
 * An IntersectionObserver rather than a scroll listener. The browser works the
 * crossing out itself, off the path it walks to produce each scrolled frame,
 * so watching for it costs nothing per frame. What this replaced was a `scroll`
 * handler calling `getBoundingClientRect()`, which forces a synchronous layout
 * every time the page moves - and the landing page ran two of them at once.
 *
 * False both before the sentinel is reached and while it is on screen; the
 * difference between "not there yet" and "gone past" is the sign of `top`.
 */
export function useScrolledPast(sentinelId: string): boolean {
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => {
      setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });

    // Observing fires the callback once with the current position, so a reload
    // partway down the page starts with the right answer instead of false.
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelId]);

  return scrolledPast;
}
