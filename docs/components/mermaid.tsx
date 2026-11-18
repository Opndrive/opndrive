'use client';

import { useEffect, useId, useRef, useState } from 'react';

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
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: LOAD_MARGIN }
    );
    observer.observe(el);

    return () => observer.disconnect();
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
    return <div ref={ref} style={{ minHeight: '4rem' }} />;
  }

  return <div className="nextra-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
