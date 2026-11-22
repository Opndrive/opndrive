'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/shared/utils/utils';

interface ReadingAidsProps {
  /** The element whose reading the bar measures: the post body. */
  articleId: string;
  /** Where "back to top" sends focus once it has scrolled: the post title. */
  titleId: string;
}

/**
 * A thin progress bar across the top of the window, and a "back to top"
 * button once the reader is well into the post.
 *
 * One passive scroll listener drives both, at most once a frame. The bar is
 * moved with a transform, which the compositor handles without a layout, and
 * it is hidden from assistive technology: it only repeats what the scroll
 * position already says.
 */
export function ReadingAids({ articleId, titleId }: ReadingAidsProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = article.getBoundingClientRect();
      // Read from the article's first line reaching the top of the window to
      // its last line reaching the bottom.
      const span = rect.height - window.innerHeight;
      const progress =
        span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : rect.top <= 0 ? 1 : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
      setShowTop(window.scrollY > window.innerHeight * 1.5);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [articleId]);

  const backToTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    // Keyboard and screen reader users continue from the top too, not from a
    // button that has just disappeared.
    document.getElementById(titleId)?.focus({ preventScroll: true });
  };

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-primary" />
      </div>

      <button
        type="button"
        onClick={backToTop}
        aria-label="Back to top"
        title="Back to top"
        className={cn(
          'fixed bottom-6 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-[opacity,visibility,background-color] duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:right-6',
          // Hidden with visibility, which also takes it out of the tab order
          // and the accessibility tree until it is useful.
          showTop ? 'visible opacity-100' : 'invisible opacity-0'
        )}
      >
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}
