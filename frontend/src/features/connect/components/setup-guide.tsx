'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { S3Provider } from '@/config/providers';

interface SetupGuideProps {
  provider: S3Provider;
  corsConfig: string;
}

/**
 * The provider-specific setup steps.
 *
 * Built on <details>, which gives a working disclosure with no JavaScript and,
 * importantly for these pages, keeps the content in the DOM where a crawler
 * reads it. Collapsing it visually does not hide it from indexing.
 *
 * This content is also what makes these pages legitimate rather than doorway
 * pages. The CORS steps, permission names and gotchas genuinely differ per
 * provider, and that difference is the whole argument for having five pages.
 */
export function SetupGuide({ provider, corsConfig }: SetupGuideProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(corsConfig.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions. The snippet is on screen and
      // selectable either way, so there is nothing useful to say here.
    }
  };

  return (
    <details className="group rounded-xl border border-border bg-card/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span>Setting up {provider.name}</span>
        <span className="text-xs font-normal text-muted-foreground transition-transform group-open:rotate-180">
          &#9662;
        </span>
      </summary>

      <div className="space-y-4 border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
            1. Allow this site in CORS
          </h3>
          <p>{provider.setup.corsInstructions}</p>
        </section>

        {corsConfig.trim() && (
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                2. Paste this policy
              </h3>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
              <code>{corsConfig.trim()}</code>
            </pre>
            <p className="mt-1.5 text-xs">
              Replace <code className="text-foreground">https://your-domain.com</code> with the
              address you use Opndrive from.
            </p>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
            3. Permissions the key needs
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {provider.setup.permissions.map((permission) => (
              <li
                key={permission}
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
              >
                {permission}
              </li>
            ))}
          </ul>
        </section>

        {provider.setup.gotcha && (
          <section className="rounded-lg border border-border bg-background p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground">
              Worth knowing
            </h3>
            <p className="text-xs">{provider.setup.gotcha}</p>
          </section>
        )}

        <a
          href={provider.setup.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          {provider.setup.docsLabel}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </details>
  );
}
