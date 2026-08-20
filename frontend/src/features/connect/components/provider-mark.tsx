import type { S3Provider } from '@/config/providers';

/**
 * A tile mark for each provider.
 *
 * These are original geometric marks, not the vendors' logos. Decision 8 of the
 * approved proposal was that our right to display the real brand assets needs
 * checking with each vendor first, so this ships something recognisable and
 * neutral in the meantime. Swapping in cleared SVGs later is a change to this
 * file and nothing else.
 *
 * The shapes are deliberately distinct from one another rather than decorative,
 * so the grid is scannable by silhouette before you read any labels.
 */

interface ProviderMarkProps {
  provider: S3Provider;
  size?: number;
  className?: string;
}

function Glyph({ slug }: { slug: string }) {
  switch (slug) {
    case 'aws-s3':
      // Stacked layers: object storage tiers.
      return (
        <>
          <path d="M12 6 L20 10 L12 14 L4 10 Z" fill="currentColor" opacity="0.95" />
          <path d="M12 17 L20 13 L20 14 L12 18 L4 14 L4 13 Z" fill="currentColor" opacity="0.55" />
        </>
      );
    case 'cloudflare-r2':
      // A wide arc: edge delivery.
      return (
        <>
          <path
            d="M5 15 a7 7 0 0 1 13.4 -2.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="17.5" cy="15.2" r="2.4" fill="currentColor" />
        </>
      );
    case 'wasabi':
      // Concentric rings: flat, uniform storage.
      return (
        <>
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </>
      );
    case 'backblaze-b2':
      // Two bars: the B2 pairing, and a drive shelf.
      return (
        <>
          <rect x="5" y="6.5" width="14" height="4.4" rx="1.4" fill="currentColor" />
          <rect x="5" y="13.1" width="9" height="4.4" rx="1.4" fill="currentColor" opacity="0.6" />
        </>
      );
    case 'minio':
      // An open container: self-hosted, your own box.
      return (
        <>
          <path
            d="M6 8 L6 17 L18 17 L18 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M4 6.5 L20 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="6" fill="currentColor" />;
  }
}

export function ProviderMark({ provider, size = 40, className = '' }: ProviderMarkProps) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{
        width: size,
        height: size,
        // Tinted tile rather than a flat brand fill, so the marks sit together
        // as a set and survive both themes.
        backgroundColor: `color-mix(in srgb, ${provider.accent} 16%, transparent)`,
        color: provider.accent,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        aria-hidden="true"
        focusable="false"
      >
        <Glyph slug={provider.slug} />
      </svg>
    </span>
  );
}
