import Link from 'next/link';
import { S3_PROVIDERS } from '@/config/providers';
import { ConnectShell } from '@/features/connect/components/connect-shell';

/**
 * Shown for a slug we do not recognise. Returns a real 404 status, so a typo
 * never becomes an indexable soft-404 competing with the pages we do want
 * ranked.
 */
export default function ProviderNotFound() {
  return (
    <ConnectShell
      eyebrow="Not found"
      title="We do not have that provider"
      subtitle="It may be spelled differently, or we may not support it yet. Any S3-compatible service works through a custom endpoint."
      backHref="/connect"
      backLabel="All providers"
    >
      <ul className="flex flex-wrap gap-2">
        {S3_PROVIDERS.map((provider) => (
          <li key={provider.slug}>
            <Link
              href={`/connect/${provider.slug}`}
              className="inline-flex rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {provider.name}
            </Link>
          </li>
        ))}
      </ul>
    </ConnectShell>
  );
}
