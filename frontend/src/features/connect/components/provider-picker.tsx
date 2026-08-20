import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { S3Provider } from '@/config/providers';
import { ProviderMark } from './provider-mark';

interface ProviderPickerProps {
  providers: readonly S3Provider[];
}

/**
 * The provider list.
 *
 * These are real links, not buttons that set state, which matters twice over.
 * A crawler follows them, so the provider pages are reachable from the site
 * rather than only from the sitemap. And the URL always matches what is on
 * screen, so a half-filled form cannot end up under the wrong provider.
 *
 * Rendering as links also keeps this a server component, so the hub ships no
 * client JavaScript at all.
 *
 * Laid out as full-width rows rather than a grid of cards. A row has space for
 * the one fact that actually decides the next screen - whether you will need to
 * paste an endpoint - and a card of the same height does not.
 */
export function ProviderPicker({ providers }: ProviderPickerProps) {
  return (
    <ul className="space-y-2">
      {providers.map((provider) => (
        <li key={provider.slug}>
          <Link
            href={`/connect/${provider.slug}`}
            className="group flex items-center gap-4 rounded-xl border border-transparent bg-surface-sunken px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <ProviderMark provider={provider} size="md" />

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{provider.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {provider.tagline}
              </span>
            </span>

            {/* The one thing worth knowing before you click. */}
            <span className="hidden shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground sm:block">
              {provider.requiresCustomEndpoint ? 'Endpoint needed' : 'Endpoint automatic'}
            </span>

            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
