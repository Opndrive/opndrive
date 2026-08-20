import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { S3Provider } from '@/config/providers';
import { ProviderMark } from './provider-mark';

interface ProviderPickerProps {
  providers: readonly S3Provider[];
}

/**
 * The provider grid on the hub.
 *
 * These are real links, not buttons that set state, which matters twice over.
 * A crawler follows them, so the provider pages are reachable from the site
 * rather than only from the sitemap. And the URL always matches what is on
 * screen, so a half-filled form cannot end up under the wrong provider.
 *
 * Rendering as links also keeps this a server component, so the whole hub page
 * ships no client JavaScript at all.
 */
export function ProviderPicker({ providers }: ProviderPickerProps) {
  return (
    <ul className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      {providers.map((provider) => (
        <li key={provider.slug}>
          <Link
            href={`/connect/${provider.slug}`}
            className="group flex h-full items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ProviderMark provider={provider} size={44} />

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{provider.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{provider.tagline}</span>
            </span>

            <ArrowRight
              className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
