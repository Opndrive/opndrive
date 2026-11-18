'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './mermaid.module.css';

/**
 * How far ahead of the viewport a diagram starts loading.
 *
 * Far enough that it is drawn before it scrolls into view, so the reader never
 * waits on it and its own growth from the placeholder happens off screen.
 */
const LOAD_MARGIN = '600px';

/**
 * A Mermaid diagram, rendered in the browser when it is about to be seen.
 *
 * Mermaid and its layout engines are about 765 KB of script before
 * compression, in four chunks. They used to load
 * the moment any page with a diagram mounted - both diagram pages put a
 * diagram well below the first screen - so every visit paid for it up front
 * whether or not the reader scrolled that far. Now nothing is fetched until the
 * diagram nears the viewport.
 *
 * Two cases draw straight away instead, as before: a diagram already above
 * the viewport when the page mounts (opened at a #heading further down, or
 * with the scroll position restored), whose growth would otherwise push the
 * text being read; and printing, which starts drawing every diagram. A print
 * taken before a diagram is drawn shows its Mermaid source rather than a gap,
 * since the browser does not wait for the drawing.
 */
export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  const [near, setNear] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Without IntersectionObserver there is no way to wait, so draw it now.
    // Nor is there a reason to wait for one already scrolled past.
    if (typeof IntersectionObserver === 'undefined' || el.getBoundingClientRect().bottom < 0) {
      setNear(true);
      return;
    }

    // Called only from events and the observer, by when `stop` exists.
    function draw() {
      setNear(true);
      stop();
    }
    // A jump past the diagram - a table-of-contents link, a #heading, a
    // restored scroll position - never makes it intersect the margin. Draw it
    // as soon as it is above the viewport, before the reader scrolls back up
    // to it, so it does not grow under the text being read later.
    function drawIfPassed() {
      if (el!.getBoundingClientRect().bottom < 0) draw();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) draw();
      },
      { rootMargin: LOAD_MARGIN }
    );
    const stop = () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', draw);
      window.removeEventListener('scroll', drawIfPassed);
      window.removeEventListener('hashchange', drawIfPassed);
    };

    window.addEventListener('beforeprint', draw);
    window.addEventListener('scroll', drawIfPassed, { passive: true });
    window.addEventListener('hashchange', drawIfPassed);
    observer.observe(el);

    return stop;
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;

    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
        if (!cancelled) setSvg(svg);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [near, chart, id]);

  if (error) {
    return (
      <pre style={{ color: 'var(--nextra-primary-hue, crimson)' }}>
        Failed to render diagram: {error}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div ref={ref} style={{ minHeight: '4rem' }}>
        <pre className={styles.printSource} aria-hidden="true">
          {chart}
        </pre>
      </div>
    );
  }

  return <div className="nextra-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
