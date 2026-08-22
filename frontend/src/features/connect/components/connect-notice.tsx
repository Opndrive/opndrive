import { ShieldCheck } from 'lucide-react';

/**
 * The standing reassurance, as one line rather than a banner.
 *
 * This started as a boxed callout and ate roughly a fifth of the first screen,
 * which pushed the provider list below the fold on a laptop. The message is
 * worth keeping - it is the thing someone about to hand over storage keys wants
 * to know - but it does not need a box to be read, and the same promise is
 * repeated beside the connect button where it actually matters.
 *
 * Kept as its own component so both steps say it identically.
 */
export function ConnectNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
