/**
 * URL redaction for analytics events.
 *
 * Dashboard routes used to carry the user's own data in the query string: the
 * object key of the file being previewed, the terms they searched their own
 * bucket for, the prefix of the folder they were browsing. Vercel Analytics
 * reports the URL of every page view, so all of it was being sent off the
 * device.
 *
 * `private-params.ts` moves `key` and `q` into the hash fragment, which a
 * browser never transmits. This is the second layer, and it runs against
 * whatever the URL actually is at send time - so a sensitive param added later,
 * or one we did not think of, is dropped rather than reported.
 *
 * The param list is an allowlist on purpose. A denylist only covers the leaks
 * somebody already thought of, which is how object keys ended up in query
 * strings to begin with.
 */

/**
 * Query params that survive redaction: campaign attribution on the marketing
 * pages, which is about how a visitor arrived rather than who they are.
 */
const ALLOWED_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
]);

/**
 * Path prefixes whose next segment identifies a specific file rather than a
 * page. Collapsing them keeps analytics grouped by route instead of scattering
 * a row per file, and stops the identifier itself being reported.
 */
const DYNAMIC_SEGMENTS: ReadonlyArray<{ prefix: string; placeholder: string }> = [
  { prefix: '/dashboard/preview/', placeholder: '[etag]' },
];

/** Reported when a URL cannot be parsed - report nothing rather than guess. */
const UNPARSEABLE = '/';

/** Only used to make relative URLs parseable; never appears in the output. */
const PARSE_BASE = 'https://opndrive.invalid';

function collapseDynamicSegments(pathname: string): string {
  for (const { prefix, placeholder } of DYNAMIC_SEGMENTS) {
    if (pathname.startsWith(prefix)) {
      return `${prefix}${placeholder}`;
    }
  }

  return pathname;
}

function keepAllowedParams(params: URLSearchParams): string {
  const kept = new URLSearchParams();

  for (const [name, value] of params) {
    if (ALLOWED_QUERY_PARAMS.has(name)) {
      kept.append(name, value);
    }
  }

  return kept.toString();
}

/**
 * Strips everything from a URL that could identify the user or their files:
 * the hash, every query param outside the allowlist, and dynamic path
 * segments.
 *
 * Assembled by hand rather than through the `URL` setters so the output is
 * exactly what it looks like - the setters percent-encode on write, which
 * would turn the `[etag]` placeholder into noise.
 */
export function redactAnalyticsUrl(rawUrl: string): string {
  try {
    const wasAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl);
    const url = new URL(rawUrl, PARSE_BASE);

    const pathname = collapseDynamicSegments(url.pathname);
    const search = keepAllowedParams(url.searchParams);
    const tail = search ? `${pathname}?${search}` : pathname;

    return wasAbsolute ? `${url.origin}${tail}` : tail;
  } catch {
    return UNPARSEABLE;
  }
}

/**
 * `beforeSend` handler for both `<Analytics />` and `<SpeedInsights />`.
 *
 * Generic over the event because the two packages declare their own
 * `BeforeSendEvent` shapes; all this needs is the `url` they have in common.
 * Always returns the event - the point is to redact page views, not drop them.
 */
export function redactAnalyticsEvent<TEvent extends { url: string }>(event: TEvent): TEvent {
  return { ...event, url: redactAnalyticsUrl(event.url) };
}
