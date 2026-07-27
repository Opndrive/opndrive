'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [chart, id]);

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
