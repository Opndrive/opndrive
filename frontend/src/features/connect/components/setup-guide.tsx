'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BookOpen, Check, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import type { S3Provider } from '@/config/providers';
import { getCorsPolicy } from '@/config/cors';
import { DOCS_URL, SITE_URL } from '@/config/links';

/**
 * The docs section that explains the lifecycle rule, step by step and per
 * provider. Linked rather than repeated: the console steps differ by provider
 * and change over time, and one copy is easier to keep right than six.
 */
const INCOMPLETE_UPLOADS_GUIDE = `${DOCS_URL}/guides/uploading-files#required-clean-up-incomplete-multipart-uploads`;

interface SetupGuideProps {
  provider: S3Provider;
}

/**
 * The address this copy of Opndrive is open at, which is the origin the CORS
 * policy has to allow.
 *
 * The server cannot know it - a self-hosted copy runs under its own domain - so
 * the server render and hydration both use SITE_URL, and React swaps in the
 * real one straight after. A client-only render (navigating here from another
 * page) reads it at once. The origin never changes, so nothing subscribes.
 */
const NEVER_CHANGES = () => () => {};

function useCurrentOrigin(): string {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => window.location.origin,
    () => SITE_URL
  );
}

/** How long "Copied" stays up after a copy. */
const COPIED_FOR_MS = 2000;

/**
 * Copies a snippet.
 *
 * The button always reads "Copy" and is named "Copy policy" (its visible text
 * plus what it copies, WCAG 2.5.3), so its name never changes under focus.
 * The result goes to a status region beside it (4.1.3): "Copied" on screen,
 * "Copied the policy" to a screen reader. The region is emptied and filled
 * again on every copy, so a second copy is announced too, and its timers are
 * cleared when the guide unmounts.
 */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be blocked by permissions. The snippet is on screen and
      // selectable either way, so there is nothing useful to say here.
      return;
    }
    // The same array throughout, so the unmount cleanup clears these too.
    timers.current.splice(0).forEach((timer) => window.clearTimeout(timer));
    setCopied(false);
    timers.current.push(
      // A tick later, so the emptied region renders before it is filled again.
      window.setTimeout(() => setCopied(true), 50),
      window.setTimeout(() => setCopied(false), COPIED_FOR_MS)
    );
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span role="status" className="text-xs text-muted-foreground">
        {copied && (
          <>
            Copied<span className="sr-only"> the {label}</span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Copy
      </button>
    </span>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
      <code>{text}</code>
    </pre>
  );
}

const STEP_HEADING = 'text-xs font-semibold uppercase tracking-wide text-foreground';

/**
 * The provider-specific setup steps.
 *
 * Open by default, and marked required where it is: without a CORS policy that
 * allows this site the browser refuses every request to the bucket, so
 * connecting fails before anything else can. Where the provider's default
 * already allows every origin (MinIO, Wasabi), it says so instead, since
 * applying a policy there is only needed once CORS has been restricted. Built
 * on <details>, which keeps the steps in the DOM where a
 * crawler reads them and still lets someone who has done this collapse it.
 *
 * This content is also what makes these pages legitimate rather than doorway
 * pages. The CORS steps, permission names and gotchas genuinely differ per
 * provider, and that difference is the whole argument for a page per provider.
 */
export function SetupGuide({ provider }: SetupGuideProps) {
  const origin = useCurrentOrigin();
  const policy = getCorsPolicy(provider.id, origin);

  return (
    <details open className="group rounded-2xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-medium text-foreground sm:px-6 [&::-webkit-details-marker]:hidden">
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">Setting up {provider.name}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {provider.setup.corsRequired ? 'Required' : 'Only if CORS is restricted'}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-5 border-t border-border px-5 py-5 text-sm leading-relaxed text-muted-foreground sm:px-6">
        <section>
          <h3 className={`mb-1.5 ${STEP_HEADING}`}>1. Allow this site in CORS</h3>
          <p>{provider.setup.corsInstructions}</p>
        </section>

        {policy && (
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className={STEP_HEADING}>
                {policy.file
                  ? `2. Save this as ${policy.file.name}`
                  : policy.format === 'shell'
                    ? '2. Run this command'
                    : '2. Paste this policy'}
              </h3>
              <CopyButton text={policy.text} label="policy" />
            </div>
            <Snippet text={policy.text} />

            {policy.file && (
              <>
                <div className="mb-1.5 mt-3 flex items-center justify-between gap-2">
                  <p className="text-xs">Then apply it:</p>
                  <CopyButton text={policy.file.command} label="command" />
                </div>
                <Snippet text={policy.file.command} />
              </>
            )}

            <p className="mt-1.5 text-xs">
              Filled in with the address this page is open at,{' '}
              <code className="text-foreground">{origin}</code>. If you also open Opndrive from
              another address, add that one too.
            </p>
          </section>
        )}

        <section>
          <h3 className={`mb-1.5 ${STEP_HEADING}`}>3. Permissions the key needs</h3>
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

        <section>
          <h3 className={`mb-1.5 ${STEP_HEADING}`}>4. Clean up interrupted uploads</h3>
          <p>
            Large files go up in parts. If an upload stops part way, the parts already sent stay in
            the bucket: billed, and missing from every listing. Opndrive removes them when an upload
            fails or is cancelled and it can still reach your bucket, but a closed tab or a dropped
            connection gives it no chance. A lifecycle rule that deletes incomplete multipart
            uploads after a few days takes care of the rest.{' '}
            <a
              href={INCOMPLETE_UPLOADS_GUIDE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              How to add the rule
            </a>
          </p>
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
