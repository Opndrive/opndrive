import { describe, expect, it, vi } from 'vitest';
import { createSender, type AnalyticsEnvironment, type AnalyticsEventName } from './analytics-core';
import { ANALYTICS_EVENTS, ANALYTICS_FIELDS } from './analytics-fields';
import { isTrackedPath } from './tracked-paths';

/**
 * The privacy policy lists ANALYTICS_FIELDS. This builds every kind of event
 * the sender can produce and fails if one carries a field the list leaves out,
 * so the published list cannot fall behind the code.
 */
function everyEvent(): Array<Record<string, unknown>> {
  const fetch = vi.fn<AnalyticsEnvironment['fetch']>(() => Promise.resolve(undefined));
  let now = 1_800_000_000_000;

  const sender = createSender(
    {
      key: 'phc_test',
      host: 'https://us.i.posthog.com',
      isTrackedPath,
      appOrigins: ['https://opndrive.app'],
      docsOrigins: ['https://docs.opndrive.app'],
      hasOptedOut: () => false,
    },
    {
      location: { href: 'https://opndrive.app/' },
      referrer: 'https://news.example/item',
      navigator: {},
      fetch,
      now: () => (now += 2000),
      randomBytes: (length) => new Uint8Array(length),
    }
  );

  sender.pageview();
  sender.linkClick('/connect');
  sender.linkClick('https://github.com/opndrive/opndrive');
  sender.linkClick('https://docs.opndrive.app/getting-started/installation');

  return fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
}

describe('the fields the privacy policy lists', () => {
  const listed = new Set(ANALYTICS_FIELDS.flatMap((group) => group.keys));
  const events = everyEvent();

  it('produces one event of every kind', () => {
    expect(events.map((event) => event.event)).toEqual([
      '$pageview',
      'open_app_click',
      'github_click',
      'install_click',
    ]);
  });

  it('lists every top-level field sent', () => {
    for (const event of events) {
      for (const key of Object.keys(event)) {
        if (key === 'properties') continue;
        expect(listed, `unlisted field "${key}"`).toContain(key);
      }
    }
  });

  it('lists every property sent', () => {
    for (const event of events) {
      for (const key of Object.keys(event.properties as object)) {
        expect(listed, `unlisted property "${key}"`).toContain(key);
      }
    }
  });

  it('lists exactly the events that can be sent', () => {
    const sendable: AnalyticsEventName[] = [
      '$pageview',
      'open_app_click',
      'github_click',
      'install_click',
    ];
    expect(ANALYTICS_EVENTS.map((event) => event.name).sort()).toEqual([...sendable].sort());
  });
});
