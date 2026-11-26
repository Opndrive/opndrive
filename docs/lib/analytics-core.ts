/**
 * Everything the public pages send for analytics, and the rules for when.
 *
 * This file is copied byte for byte to docs/lib/analytics-core.ts, because the
 * docs site is its own app and cannot import from this one. A test in the
 * frontend suite fails when the two copies differ: edit this one, then copy it.
 * It imports nothing, so the copy needs nothing else.
 *
 * There is no analytics library on either site. A library would run code we
 * did not write on the origin that holds people's storage keys, and would
 * bring features (cookies, autocapture, recordings) that each have to be
 * switched off and kept off through its updates. Instead every field sent is
 * built here, and the privacy policy lists the same fields.
 *
 * None of it runs unless a site was built with a PostHog key and host. Default
 * builds and the Docker image have neither, and leave this code out entirely.
 */

export type AnalyticsEventName = '$pageview' | 'open_app_click' | 'github_click' | 'install_click';

export type LinkEventName = Exclude<AnalyticsEventName, '$pageview'>;

export interface AnalyticsSite {
  /** The PostHog project key. Public by design: it can only send events. */
  key: string;
  /** The PostHog ingestion origin, for example https://us.i.posthog.com. */
  host: string;
  /** Whether the page at this path may send anything. Nothing else does. */
  isTrackedPath: (pathname: string) => boolean;
  /** Origins whose /connect and /dashboard pages are the app. */
  appOrigins: readonly string[];
  /** Origins of the documentation, whose install guides count as install links. */
  docsOrigins: readonly string[];
  /** The visitor's own opt-out, read again before every send. */
  hasOptedOut: () => boolean;
}

/** What this reads from the browser. Passed in, so tests can set every part. */
export interface AnalyticsEnvironment {
  location: { readonly href: string };
  referrer: string;
  navigator: { readonly doNotTrack?: string | null; readonly globalPrivacyControl?: boolean };
  /** `window.doNotTrack`, where older Safari and Edge kept the setting. */
  windowDoNotTrack?: string | null;
  fetch: (url: string, init: RequestInit) => Promise<unknown>;
  now: () => number;
  randomBytes: (length: number) => Uint8Array;
}

export interface AnalyticsSender {
  /** Counts the page now showing, if it is one that may be counted. */
  pageview: () => void;
  /** Counts a followed link, if it leads to the app, GitHub or an install guide. */
  linkClick: (href: string) => void;
}

const APP_PATHS = ['/connect', '/dashboard'];

const INSTALL_PATHS = ['/getting-started/installation', '/getting-started/deployment'];

const REPOSITORY_HOSTS = ['github.com', 'www.github.com'];

const REPOSITORY_PATH = '/opndrive/opndrive';

/** A visit ends after this long without an event, as PostHog's own sessions do. */
const VISIT_IDLE_MS = 30 * 60 * 1000;

/** React runs effects twice in development: the same page twice this fast is one view. */
const REPEAT_VIEW_MS = 1000;

function isAtOrUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function parseWebUrl(raw: string, base?: string): URL | null {
  try {
    const url = new URL(raw, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** An address with nothing after its path: no query string, no fragment. */
export function stripUrl(raw: string, base?: string): string | null {
  const url = parseWebUrl(raw, base);
  return url ? `${url.origin}${url.pathname}` : null;
}

/** Which event a followed link is, or null for every link that is not counted. */
export function classifyLink(
  href: string,
  site: Pick<AnalyticsSite, 'appOrigins' | 'docsOrigins'>,
  base?: string
): LinkEventName | null {
  const url = parseWebUrl(href, base);
  if (!url) return null;

  // GitHub paths are case-insensitive; ours are not.
  if (
    REPOSITORY_HOSTS.includes(url.hostname) &&
    isAtOrUnder(url.pathname.toLowerCase(), REPOSITORY_PATH)
  ) {
    return 'github_click';
  }

  if (site.appOrigins.includes(url.origin) && APP_PATHS.some((p) => isAtOrUnder(url.pathname, p))) {
    return 'open_app_click';
  }

  const docsPath = url.pathname.replace(/\/+$/, '');
  if (site.docsOrigins.includes(url.origin) && INSTALL_PATHS.includes(docsPath)) {
    return 'install_click';
  }

  return null;
}

/** True when the browser asks not to be tracked, by either signal. */
export function browserDeclines(
  env: Pick<AnalyticsEnvironment, 'navigator' | 'windowDoNotTrack'>
): boolean {
  return (
    env.navigator.globalPrivacyControl === true ||
    env.navigator.doNotTrack === '1' ||
    env.windowDoNotTrack === '1'
  );
}

/**
 * A version 7 UUID: 48 bits of milliseconds, then random bits. PostHog builds
 * its sessions from session ids of this form.
 */
export function uuidv7(now: number, random: Uint8Array): string {
  const bytes = new Uint8Array(16);
  bytes.set(random.subarray(0, 10), 6);

  let ms = Math.floor(now);
  for (let index = 5; index >= 0; index--) {
    bytes[index] = ms % 256;
    ms = Math.floor(ms / 256);
  }

  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Where events go, or null when the host is not an https address. */
export function ingestionUrl(host: string): string | null {
  const url = parseWebUrl(host);
  return url && url.protocol === 'https:' ? `${url.origin}/i/v0/e/` : null;
}

/** The site that linked here, as a domain and nothing more. */
function referrerProperties(referrer: string): Record<string, string> {
  const url = parseWebUrl(referrer);
  return url
    ? { $referrer: url.origin, $referring_domain: url.hostname }
    : { $referrer: '$direct', $referring_domain: '$direct' };
}

/**
 * The sender for one page load.
 *
 * The visit id lives in this closure and nowhere else: not in a cookie, not in
 * storage. A reload or a new tab starts a new visit, which is the point.
 */
export function createSender(site: AnalyticsSite, env: AnalyticsEnvironment): AnalyticsSender {
  const endpoint = ingestionUrl(site.host);

  let visit: { id: string; lastAt: number } | null = null;
  let referrerPending = true;
  let lastView: { path: string; at: number } | null = null;

  function visitId(now: number): string {
    if (!visit || now - visit.lastAt > VISIT_IDLE_MS) {
      visit = { id: uuidv7(now, env.randomBytes(10)), lastAt: now };
    } else {
      visit.lastAt = now;
    }
    return visit.id;
  }

  function send(event: AnalyticsEventName, extra: Record<string, string> = {}): void {
    if (!endpoint || !site.key) return;

    const page = parseWebUrl(env.location.href);
    if (!page || !site.isTrackedPath(page.pathname)) return;
    if (browserDeclines(env) || site.hasOptedOut()) return;

    const now = env.now();
    const id = visitId(now);

    const properties: Record<string, string | boolean> = {
      $current_url: `${page.origin}${page.pathname}`,
      $host: page.host,
      $pathname: page.pathname,
      $session_id: id,
      $process_person_profile: false,
      $geoip_disable: true,
      $lib: 'opndrive-web',
      ...extra,
    };

    // Only the first event of a page load knows where the visitor came from.
    if (referrerPending) {
      referrerPending = false;
      Object.assign(properties, referrerProperties(env.referrer));
    }

    const body = JSON.stringify({
      api_key: site.key,
      event,
      distinct_id: id,
      timestamp: new Date(now).toISOString(),
      properties,
    });

    try {
      // text/plain and no-cors keep this a simple request with no preflight.
      // `credentials: 'omit'` sends no cookies, and `no-referrer` keeps the
      // full page address out of the request headers. `keepalive` lets a click
      // that leaves the page still arrive.
      void env
        .fetch(endpoint, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'text/plain' },
          keepalive: true,
          credentials: 'omit',
          mode: 'no-cors',
          referrerPolicy: 'no-referrer',
        })
        .catch(() => {});
    } catch {
      // A blocked or refused request is the visitor's choice. Nothing to do.
    }
  }

  return {
    pageview() {
      const page = parseWebUrl(env.location.href);
      if (!page) return;

      const now = env.now();
      if (lastView && lastView.path === page.pathname && now - lastView.at < REPEAT_VIEW_MS) {
        return;
      }
      lastView = { path: page.pathname, at: now };

      send('$pageview');
    },

    linkClick(href) {
      const event = classifyLink(href, site, env.location.href);
      const link = event ? stripUrl(href, env.location.href) : null;
      if (event && link) send(event, { href: link });
    },
  };
}

/** The real browser, for createSender. */
export function browserEnvironment(): AnalyticsEnvironment {
  return {
    location: window.location,
    referrer: document.referrer,
    navigator: window.navigator as AnalyticsEnvironment['navigator'],
    windowDoNotTrack: (window as { doNotTrack?: string | null }).doNotTrack,
    fetch: (url, init) => window.fetch(url, init),
    now: () => Date.now(),
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  };
}

/**
 * Counts followed links, with one listener for the whole page. Middle clicks
 * (`auxclick`) count too: opening a link in a new tab is following it.
 */
export function listenForLinkClicks(target: Document, sender: AnalyticsSender): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button > 1) return;

    const origin = event.target as Element | null;
    const anchor = typeof origin?.closest === 'function' ? origin.closest('a[href]') : null;
    if (anchor instanceof HTMLAnchorElement) sender.linkClick(anchor.href);
  };

  target.addEventListener('click', onClick, true);
  target.addEventListener('auxclick', onClick, true);

  return () => {
    target.removeEventListener('click', onClick, true);
    target.removeEventListener('auxclick', onClick, true);
  };
}
