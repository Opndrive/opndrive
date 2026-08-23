import Link from 'next/link';
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
 * Laid out as a wrapping grid of logo + name only. The tagline and endpoint
 * badge that used to live here belong to the provider's own page, not the
 * pick-one step - this step just needs to be scannable at a glance.
 *
 * Single column below `sm`: two columns at phone widths leaves barely enough
 * room for the icon plus names like "Cloudflare R2", forcing an ellipsis on
 * exactly the text that identifies the row.
 */
export function ProviderPicker({ providers }: ProviderPickerProps) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {providers.map((provider) => (
        <li key={provider.slug}>
          <Link
            href={`/connect/${provider.slug}`}
            className="flex items-center gap-3 rounded-xl border border-transparent bg-surface-sunken px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <ProviderMark provider={provider} size="sm" iconSize={20} />
            <span className="truncate text-sm font-medium text-foreground">{provider.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
