import { ExternalLink } from 'lucide-react';
import type { S3Provider } from '@/config/providers';
import { DOCS_URL } from '@/config/links';
import { CONNECTION_FAILURE_TITLES } from '@/lib/s3/connection-failure';

/** The docs page that explains every one of these at length. */
export const CONNECTION_ERRORS_GUIDE = `${DOCS_URL}/guides/fixing-connection-errors`;

interface Failure {
  /** What the user sees, quoted exactly. */
  message: string;
  explanation: React.ReactNode;
}

/**
 * The failures every provider shares, keyed to what the app actually shows.
 *
 * The first four quote the headings from lib/s3/connection-failure.ts, the
 * code that decides them, so the words here are the words on screen. The
 * error codes named under each are the ones that code maps to that heading.
 */
const SHARED_FAILURES: Failure[] = [
  {
    message: CONNECTION_FAILURE_TITLES.network,
    explanation: (
      <>
        No answer came back. Open the browser&apos;s developer console (F12): a line saying the
        request &ldquo;has been blocked by CORS policy&rdquo; and &ldquo;No
        &apos;Access-Control-Allow-Origin&apos; header is present&rdquo; means the bucket does not
        allow this site yet, so apply the policy above. With no such line, check the endpoint
        address and your connection.
      </>
    ),
  },
  {
    message: CONNECTION_FAILURE_TITLES.credentials,
    explanation: (
      <>
        Your provider did not accept the key. <code>InvalidAccessKeyId</code> means the access key
        ID does not exist; <code>SignatureDoesNotMatch</code> means the secret does not belong to
        it. Check both for typos and stray spaces, and that the key has not been deleted.
      </>
    ),
  },
  {
    message: CONNECTION_FAILURE_TITLES.bucket,
    explanation: (
      <>
        <code>NoSuchBucket</code> means no bucket has that name. <code>PermanentRedirect</code>{' '}
        means it exists but has to be reached through a different endpoint, which usually means the
        region is wrong.
      </>
    ),
  },
  {
    message: CONNECTION_FAILURE_TITLES.permissions,
    explanation: (
      <>
        <code>AccessDenied</code>: the provider knows the key, but its policy does not allow the
        request. Give it the permissions in step 3, on this bucket.
      </>
    ),
  },
  {
    message: 'Large uploads never finish, while small files work',
    explanation: (
      <>
        Bigger files go up in parts, and finishing the upload needs each part&apos;s{' '}
        <code>ETag</code>, which the browser hides unless the CORS policy exposes it. Make sure{' '}
        <code>ETag</code> is in the exposed headers, as it is in the policy above.
      </>
    ),
  },
];

/**
 * "If it fails": what each message on screen means and how to fix it, for one
 * provider.
 *
 * A server component, so it is in the HTML a crawler reads. These are the
 * questions people search for when a connection fails, and the answers are
 * specific to the app - the exact headings it shows - rather than generic
 * advice about S3.
 */
export function ConnectionTroubleshooting({ provider }: { provider: S3Provider }) {
  const extra = provider.setup.troubleshooting ?? [];

  return (
    <section
      aria-labelledby="if-it-fails"
      className="rounded-2xl border border-border bg-card px-5 py-5 shadow-sm sm:px-6"
    >
      <h2 id="if-it-fails" className="text-sm font-medium text-foreground">
        If it fails
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What each message Opndrive shows means when connecting to {provider.name}, and the fix.
      </p>

      <ul className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
        {SHARED_FAILURES.map(({ message, explanation }) => (
          <li key={message}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-foreground">
              &ldquo;{message}&rdquo;
            </h3>
            <p>{explanation}</p>
          </li>
        ))}
      </ul>

      {extra.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground">
            Particular to {provider.name}
          </h3>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            {extra.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={CONNECTION_ERRORS_GUIDE}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        Every connection error, explained
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </section>
  );
}
