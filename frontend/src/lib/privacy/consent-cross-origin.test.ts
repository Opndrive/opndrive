/**
 * The contract between the two apps.
 *
 * `docs.opndrive.app` is a separate Next app that cannot import from here, so
 * `docs/lib/consent.ts` is a deliberate small duplicate of the read half of
 * this module. Duplicates drift, and this one drifting would silently mean an
 * opt-out set on the main site stops being honoured on the docs site - no
 * error, no failing build, just analytics quietly running for somebody who
 * asked it not to.
 *
 * So the two are compared as source. It is a blunt test, and it is blunt on
 * purpose: it fails the moment the shapes stop matching, which is the only
 * moment that matters.
 *
 * @vitest-environment-options { "url": "https://opndrive.app/" }
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSENT_COOKIE_NAME, setAnalyticsOptOut } from './consent';

const DOCS_CONSENT = readFileSync(join(process.cwd(), '..', 'docs', 'lib', 'consent.ts'), 'utf8');

function docsConstant(name: string): string | undefined {
  return new RegExp(`${name}\\s*=\\s*(['"])([^'"]*)\\1`).exec(DOCS_CONSENT)?.[2];
}

describe('docs reads the same cookie the app writes', () => {
  it('agrees on the cookie name', () => {
    expect(docsConstant('CONSENT_COOKIE_NAME')).toBe(CONSENT_COOKIE_NAME);
  });

  it('agrees on the schema version', () => {
    const version = /CONSENT_VERSION\s*=\s*(\d+)/.exec(DOCS_CONSENT)?.[1];

    expect(version).toBe('1');
  });

  it('agrees that analytics defaults to allowed', () => {
    expect(DOCS_CONSENT).toMatch(/DEFAULT_ANALYTICS_ALLOWED\s*=\s*true/);
  });

  it('reads the same field name out of the payload', () => {
    expect(DOCS_CONSENT).toContain('parsed.analytics');
  });

  // The docs side must only ever read. If it grows a writer, the two copies
  // can disagree about what was written and the bug becomes very hard to see.
  it('never writes the cookie from the docs side', () => {
    expect(DOCS_CONSENT).not.toMatch(/document\.cookie\s*=/);
  });

  it('waits for the cookie before deciding, like the app does', () => {
    expect(DOCS_CONSENT).toContain('isResolved');
  });
});

describe('a cookie written by the app is readable by the docs parser', () => {
  /** Mirrors the parse in docs/lib/consent.ts against a real written cookie. */
  function parseAsDocsWould(cookieHeader: string): boolean {
    const DEFAULT = true;

    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');

      if (name !== 'opndrive_privacy') continue;

      try {
        const parsed = JSON.parse(decodeURIComponent(rest.join('=')));

        if (parsed?.v === 1 && typeof parsed.analytics === 'boolean') {
          return parsed.analytics;
        }
      } catch {
        return DEFAULT;
      }
    }

    return DEFAULT;
  }

  it('round-trips an opt-out', () => {
    setAnalyticsOptOut(true);

    expect(parseAsDocsWould(document.cookie)).toBe(false);
  });

  it('round-trips opting back in, which removes the cookie', () => {
    setAnalyticsOptOut(true);
    setAnalyticsOptOut(false);

    expect(parseAsDocsWould(document.cookie)).toBe(true);
  });
});
