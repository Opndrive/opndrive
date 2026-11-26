import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  browserDeclines,
  classifyLink,
  createSender,
  ingestionUrl,
  stripUrl,
  uuidv7,
  type AnalyticsEnvironment,
  type AnalyticsSite,
} from './analytics-core';
import { isTrackedPath } from './tracked-paths';

const HOST = 'https://us.i.posthog.com';

function makeSite(overrides: Partial<AnalyticsSite> = {}): AnalyticsSite {
  return {
    key: 'phc_test',
    host: HOST,
    isTrackedPath,
    appOrigins: ['https://opndrive.app'],
    docsOrigins: ['https://docs.opndrive.app'],
    hasOptedOut: () => false,
    ...overrides,
  };
}

function makeEnv(overrides: Partial<AnalyticsEnvironment> = {}) {
  const location = { href: 'https://opndrive.app/blog/a-post?utm_source=x#part' };
  let clock = Date.UTC(2026, 10, 26, 12, 0, 0);
  const fetch = vi.fn<AnalyticsEnvironment['fetch']>(() => Promise.resolve(undefined));

  const env: AnalyticsEnvironment = {
    location,
    referrer: 'https://www.google.com/search?q=private+words',
    navigator: {},
    fetch,
    now: () => clock,
    randomBytes: (length) => new Uint8Array(length).fill(7),
    ...overrides,
  };

  return {
    env,
    fetch,
    location,
    advance: (ms: number) => {
      clock += ms;
    },
    sent: () =>
      fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>),
  };
}

describe('what is sent', () => {
  it('sends a page view to the ingestion endpoint, and only that endpoint', () => {
    const { env, fetch } = makeEnv();
    createSender(makeSite(), env).pageview();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${HOST}/i/v0/e/`);
  });

  it('strips the query string and fragment from the page address', () => {
    const { env, sent } = makeEnv();
    createSender(makeSite(), env).pageview();

    const properties = sent()[0].properties as Record<string, unknown>;
    expect(properties.$current_url).toBe('https://opndrive.app/blog/a-post');
    expect(properties.$pathname).toBe('/blog/a-post');
    expect(JSON.stringify(sent()[0])).not.toMatch(/utm_source|#part|private/);
  });

  it('sends the referring site as a domain, never its full address', () => {
    const { env, sent } = makeEnv();
    createSender(makeSite(), env).pageview();

    const properties = sent()[0].properties as Record<string, unknown>;
    expect(properties.$referrer).toBe('https://www.google.com');
    expect(properties.$referring_domain).toBe('www.google.com');
  });

  it('marks a visit with no referrer as direct', () => {
    const { env, sent } = makeEnv({ referrer: '' });
    createSender(makeSite(), env).pageview();

    expect((sent()[0].properties as Record<string, unknown>).$referrer).toBe('$direct');
  });

  it('sends the referrer with the first event of a page load only', () => {
    const { env, sent, location, advance } = makeEnv();
    const sender = createSender(makeSite(), env);

    sender.pageview();
    advance(5000);
    location.href = 'https://opndrive.app/blog';
    sender.pageview();

    expect(sent()[1].properties).not.toHaveProperty('$referrer');
  });

  it('tells PostHog to build no profile and look up no location', () => {
    const { env, sent } = makeEnv();
    createSender(makeSite(), env).pageview();

    expect(sent()[0].properties).toMatchObject({
      $process_person_profile: false,
      $geoip_disable: true,
    });
  });

  it('sends no cookies, no page address in a header, and survives the page closing', () => {
    const { env, fetch } = makeEnv();
    createSender(makeSite(), env).pageview();

    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
    });
  });
});

describe('the visit ID', () => {
  it('is a version 7 UUID, used as both the visitor and the session', () => {
    const { env, sent } = makeEnv();
    createSender(makeSite(), env).pageview();

    const [event] = sent();
    expect(event.distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect((event.properties as Record<string, unknown>).$session_id).toBe(event.distinct_id);
  });

  it('stays the same across pages of one visit', () => {
    const { env, sent, location, advance } = makeEnv({
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    });
    const sender = createSender(makeSite(), env);

    sender.pageview();
    advance(60_000);
    location.href = 'https://opndrive.app/';
    sender.pageview();

    expect(sent()[1].distinct_id).toBe(sent()[0].distinct_id);
  });

  it('starts again after 30 idle minutes', () => {
    const { env, sent, location, advance } = makeEnv({
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    });
    const sender = createSender(makeSite(), env);

    sender.pageview();
    advance(31 * 60_000);
    location.href = 'https://opndrive.app/';
    sender.pageview();

    expect(sent()[1].distinct_id).not.toBe(sent()[0].distinct_id);
  });

  it('is never written anywhere', () => {
    localStorage.clear();
    sessionStorage.clear();
    const { env } = makeEnv();

    const sender = createSender(makeSite(), env);
    sender.pageview();
    sender.linkClick('/connect');

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('encodes the time in its first 48 bits', () => {
    const id = uuidv7(0x0123456789ab, new Uint8Array(10));
    expect(id.startsWith('01234567-89ab-7')).toBe(true);
  });
});

describe('when nothing is sent', () => {
  it.each(['/connect', '/connect/aws', '/dashboard', '/dashboard/browse', '/privacy', '/terms'])(
    'nothing on %s',
    (path) => {
      const { env, fetch } = makeEnv({ location: { href: `https://opndrive.app${path}` } });
      const sender = createSender(makeSite(), env);

      sender.pageview();
      sender.linkClick('https://github.com/Opndrive/opndrive');

      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('nothing when the browser sends Do Not Track', () => {
    const { env, fetch } = makeEnv({ navigator: { doNotTrack: '1' } });
    createSender(makeSite(), env).pageview();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('nothing when the browser sends Global Privacy Control', () => {
    const { env, fetch } = makeEnv({ navigator: { globalPrivacyControl: true } });
    createSender(makeSite(), env).pageview();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('nothing after the visitor opts out, read at the moment of sending', () => {
    let optedOut = false;
    const { env, fetch, advance, location } = makeEnv();
    const sender = createSender(makeSite({ hasOptedOut: () => optedOut }), env);

    sender.pageview();
    optedOut = true;
    advance(5000);
    location.href = 'https://opndrive.app/';
    sender.pageview();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('nothing without a key or an https host', () => {
    for (const site of [
      makeSite({ key: '' }),
      makeSite({ host: '' }),
      makeSite({ host: 'http://us.i.posthog.com' }),
    ]) {
      const { env, fetch } = makeEnv();
      createSender(site, env).pageview();
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('one page view when React runs the effect twice', () => {
    const { env, fetch } = makeEnv();
    const sender = createSender(makeSite(), env);

    sender.pageview();
    sender.pageview();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('nothing for links that are not to the app, GitHub or an install guide', () => {
    const { env, fetch } = makeEnv();
    const sender = createSender(makeSite(), env);

    for (const href of [
      '/blog',
      'https://discord.gg/x',
      'https://docs.opndrive.app/',
      'mailto:a@b.c',
    ]) {
      sender.linkClick(href);
    }

    expect(fetch).not.toHaveBeenCalled();
  });

  it('nothing, quietly, when the request is refused', async () => {
    const { env } = makeEnv({ fetch: () => Promise.reject(new Error('blocked')) });
    expect(() => createSender(makeSite(), env).pageview()).not.toThrow();
  });
});

describe('links', () => {
  const site = makeSite();
  const base = 'https://opndrive.app/blog/post';

  it.each([
    ['/connect', 'open_app_click'],
    ['/connect/aws', 'open_app_click'],
    ['https://opndrive.app/dashboard', 'open_app_click'],
    ['https://github.com/Opndrive/opndrive', 'github_click'],
    ['https://github.com/opndrive/opndrive/releases', 'github_click'],
    ['https://docs.opndrive.app/getting-started/installation', 'install_click'],
    ['https://docs.opndrive.app/getting-started/deployment/', 'install_click'],
  ])('%s counts as %s', (href, event) => {
    expect(classifyLink(href, site, base)).toBe(event);
  });

  it.each([
    '/connected-stories',
    'https://evil.example/connect',
    'https://github.com/someone-else/opndrive',
    'https://github.com/opndrive/opndrive-fork',
    'https://docs.opndrive.app/getting-started/introduction',
  ])('%s does not count', (href) => {
    expect(classifyLink(href, site, base)).toBeNull();
  });

  it('sends the link address without its query string', () => {
    const { env, sent } = makeEnv();
    createSender(makeSite(), env).linkClick('/connect?from=post#top');

    expect(sent()[0].event).toBe('open_app_click');
    expect((sent()[0].properties as Record<string, unknown>).href).toBe(
      'https://opndrive.app/connect'
    );
  });
});

describe('helpers', () => {
  it('stripUrl keeps origin and path only', () => {
    expect(stripUrl('https://a.example/p/q?x=1#y')).toBe('https://a.example/p/q');
    expect(stripUrl('javascript:alert(1)')).toBeNull();
  });

  it('ingestionUrl accepts https only', () => {
    expect(ingestionUrl('https://us.i.posthog.com/')).toBe('https://us.i.posthog.com/i/v0/e/');
    expect(ingestionUrl('http://us.i.posthog.com')).toBeNull();
    expect(ingestionUrl('not a url')).toBeNull();
  });

  it('browserDeclines reads every form of the signal', () => {
    expect(browserDeclines({ navigator: {} })).toBe(false);
    expect(browserDeclines({ navigator: { doNotTrack: '0' } })).toBe(false);
    expect(browserDeclines({ navigator: {}, windowDoNotTrack: '1' })).toBe(true);
  });
});

describe('the copy on the docs site', () => {
  // The docs site cannot import this file, so it carries a copy. A copy that
  // drifts could send something the privacy policy does not list.
  it('is identical to this file', () => {
    const read = (...parts: string[]) =>
      readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

    expect(read('..', 'docs', 'lib', 'analytics-core.ts')).toBe(
      read('src', 'lib', 'analytics', 'analytics-core.ts')
    );
  });
});
