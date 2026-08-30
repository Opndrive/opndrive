import { useEffect, useState } from 'react';

/**
 * Whether the element with `sentinelId` has scrolled up out of the viewport.
 *
 * An IntersectionObserver rather than a scroll listener. The browser works the
 * crossing out itself, off the path it walks to produce each scrolled frame,
 * so watching for it costs nothing per frame. What this replaced was a `scroll`
 * handler calling `getBoundingClientRect()`, which forces a synchronous layout
 * every time the page moves - and the landing page ran two of them at once.
 */
export function useScrolledPast(sentinelId: string): boolean {
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => setScrolledPast(!entry.isIntersecting), {
      /**
       * The root is grown downward until the page cannot be longer than it,
       * so the sentinel counts as intersecting from the moment the page
       * loads right up until it leaves over the top edge.
       *
       * That is what makes the one transition this hook cares about a real
       * one. An observer only reports when a target's intersecting state
       * changes, and against the bare viewport a sentinel below the fold and
       * a sentinel above it are both simply "not intersecting" - so a jump
       * straight from one to the other, with no frame in between where the
       * sentinel was on screen, changed nothing to report and the callback
       * never ran. The bar stayed hidden on a page that had scrolled well
       * past the hero.
       *
       * Reaching that took no trickery: a `#faq` deep link, the scroll
       * position a browser restores on a back navigation, or any hero taller
       * than the viewport - which is every phone once the address bar has
       * taken its cut - starts the sentinel below the fold and lands past it.
       *
       * With the root extended there is only ever one crossing, at the top
       * edge, and `isIntersecting` alone is the answer.
       */
      rootMargin: '0px 0px 100000px 0px',
    });

    // Observing fires the callback once with the current position, so a reload
    // partway down the page starts with the right answer instead of false.
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelId]);

  return scrolledPast;
}
