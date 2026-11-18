import { ExternalLink } from 'lucide-react';
import type { S3Provider } from '@/config/providers';
import { DOCS_URL } from '@/config/links';
import { CONNECTION_FAILURE_CODES, CONNECTION_FAILURE_TITLES } from '@/lib/s3/connection-failure';

/** The docs page that explains every one of these at length. */
export const CONNECTION_ERRORS_GUIDE = `${DOCS_URL}/guides/fixing-connection-errors`;

interface Failure {
  /**
   * A message Opndrive shows, quoted exactly; or, where the app shows no
   * message of its own, a description of what the user notices.
   */
  heading: string;
  /** True when `heading` is words on screen, shown in quotation marks. */
  quoted: boolean;
  explanation: React.ReactNode;
  /** The error names and status the classifier files under this heading. */
  codes?: { names: readonly string[]; status: number };
}

/**
 * The codes the classifier files under a heading, and the status it falls back
 * on. Worded so the codes do not read as having that status: S3 sends
 * InvalidAccessKeyId with 403, PermanentRedirect with 301.
 */
function CodeList({ codes }: { codes: NonNullable<Failure['codes']> }) {
  return (
    <span className="mt-1 block text-xs">
      Shown for the error codes{' '}
      {codes.names.map((name, index) => (
        <span key={name}>
          <code>{name}</code>
          {index < codes.names.length - 1 ? ', ' : ''}
        </span>
      ))}
      , and for any other error answered with HTTP status {codes.status}.
    </span>
  );
}

/**
 * The failures every provider can hit, keyed to what the app actually shows.
 *
 * The quoted headings are CONNECTION_FAILURE_TITLES and the codes under them
 * are CONNECTION_FAILURE_CODES, both from lib/s3/connection-failure.ts, the
 * code that decides them, so the page cannot drift from the screen. The words
 * around them adjust to the provider: where CORS is open by default (MinIO,
 * Wasabi) a blocked request means it has been restricted, and where the
 * provider already exposes ETag (MinIO) its CORS settings are not the fix.
 */
function sharedFailures(provider: S3Provider): Failure[] {
  const corsFix = provider.setup.corsRequired
    ? 'means the bucket does not allow this site yet: apply the CORS policy from the setup steps above.'
    : `means CORS on your ${provider.name} storage has been restricted and does not include this site: add it as the setup steps above describe.`;

  return [
    {
      heading: CONNECTION_FAILURE_TITLES.network,
      quoted: true,
      explanation: (
        <>
          No answer came back. Open the browser&apos;s developer console (F12): a line saying the
          request &ldquo;has been blocked by CORS policy&rdquo; and &ldquo;No
          &apos;Access-Control-Allow-Origin&apos; header is present&rdquo; {corsFix} With no such
          line, check the endpoint address and your connection.
        </>
      ),
    },
    {
      heading: CONNECTION_FAILURE_TITLES.credentials,
      quoted: true,
      explanation: (
        <>
          Your provider did not accept the key. <code>InvalidAccessKeyId</code> means the access key
          ID does not exist; <code>SignatureDoesNotMatch</code> means the secret does not belong to
          it. Check both for typos and stray spaces, and that the key has not been deleted.{' '}
          <code>AuthorizationHeaderMalformed</code> is filed here too, but on Amazon S3 it means the
          region does not match the bucket&apos;s, so check the region before the keys.
        </>
      ),
      codes: CONNECTION_FAILURE_CODES.credentials,
    },
    {
      heading: CONNECTION_FAILURE_TITLES.bucket,
      quoted: true,
      explanation: (
        <>
          <code>NoSuchBucket</code> means no bucket has that name. <code>PermanentRedirect</code>{' '}
          means it exists but has to be reached through a different endpoint, which usually means
          the region is wrong.
        </>
      ),
      codes: CONNECTION_FAILURE_CODES.bucket,
    },
    {
      heading: CONNECTION_FAILURE_TITLES.permissions,
      quoted: true,
      explanation: (
        <>
          <code>AccessDenied</code>: the provider knows the key, but its policy does not allow the
          request. Give it the permissions in step 3, on this bucket.
        </>
      ),
      codes: CONNECTION_FAILURE_CODES.permissions,
    },
    {
      heading: CONNECTION_FAILURE_TITLES.unknown,
      quoted: true,
      explanation: (
        <>
          Your provider answered with an error Opndrive does not recognise, such as a server error.
          Trying again is worth a go; if it keeps happening, the browser console has the request and
          the provider&apos;s own message.
        </>
      ),
    },
    {
      heading: 'Large uploads fail or keep retrying at the end, while small files upload',
      quoted: false,
      explanation: provider.setup.etagExposedByDefault ? (
        <>
          Bigger files go up in parts, and finishing the upload needs each part&apos;s{' '}
          <code>ETag</code>, which the browser hides unless CORS exposes it. {provider.name}{' '}
          Community Edition exposes <code>ETag</code> in its own CORS answers, so with it this means
          something else answers CORS: per-bucket rules on MinIO AIStor, or a reverse proxy in front
          of the server. Expose <code>ETag</code> there.
        </>
      ) : !provider.setup.corsRequired ? (
        <>
          Bigger files go up in parts, and finishing the upload needs each part&apos;s{' '}
          <code>ETag</code>, which the browser hides unless CORS exposes it. {provider.name}&apos;s
          default CORS exposes every header, so this happens once a CORS policy without{' '}
          <code>ETag</code> has been saved. Apply the policy above, which exposes it.
        </>
      ) : (
        <>
          Bigger files go up in parts, and finishing the upload needs each part&apos;s{' '}
          <code>ETag</code>, which the browser hides unless the CORS policy exposes it. Make sure{' '}
          <code>ETag</code> is in the exposed headers, as it is in the policy above.
        </>
      ),
    },
  ];
}

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
        {sharedFailures(provider).map(({ heading, quoted, explanation, codes }) => (
          <li key={heading}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-foreground">
              {quoted ? <>&ldquo;{heading}&rdquo;</> : heading}
            </h3>
            <p>
              {explanation}
              {codes && <CodeList codes={codes} />}
            </p>
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
