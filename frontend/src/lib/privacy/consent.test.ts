/**
 * Runs against a real https://opndrive.app origin.
 *
 * jsdom enforces cookie domain rules properly: a document on localhost cannot
 * set a cookie for `.opndrive.app`, and it silently drops the attempt. Faking
 * `window.location` is not enough because the cookie jar keys off the document
 * URL, so the origin has to actually be right for the round-trip tests below
 * to mean anything.
 *
 * @vitest-environment-options { "url": "https://opndrive.app/" }
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONSENT_COOKIE_NAME,
  CONSENT_STORAGE_KEY,
  mayLoadAnalytics,
  resolveConsent,
  setAnalyticsOptOut,
  useConsent,
} from './consent';

/** jsdom keeps cookies per document; clearing means expiring each one. */
function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
}

function setHostname(hostname: string, protocol = 'https:') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, protocol, pathname: '/', search: '' },
  });
}

const originalLocation = window.location;

beforeEach(() => {
  clearCookies();
  localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('default state', () => {
  it('allows analytics when nothing has been chosen', () => {
    expect(resolveConsent()).toEqual({ analytics: true, hasChosen: false });
    expect(mayLoadAnalytics()).toBe(true);
  });

  // The whole point of the opt-out model: a visitor who never acts should end
  // up with nothing stored in their browser at all.
  it('stores nothing at all for a visitor who never acts', () => {
    resolveConsent();

    expect(document.cookie).toBe('');
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });
});

describe('opting out', () => {
  it('blocks analytics', () => {
    setAnalyticsOptOut(true);

    expect(resolveConsent()).toEqual({ analytics: false, hasChosen: true });
    expect(mayLoadAnalytics()).toBe(false);
  });

  it('writes the cookie so the choice can reach the docs subdomain', () => {
    setAnalyticsOptOut(true);

    expect(document.cookie).toContain(CONSENT_COOKIE_NAME);
  });

  it('mirrors into localStorage for a fast read', () => {
    setAnalyticsOptOut(true);

    const mirrored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}');

    expect(mirrored.analytics).toBe(false);
    expect(mirrored.v).toBe(1);
    expect(typeof mirrored.updatedAt).toBe('string');
  });
});

describe('opting back in', () => {
  // Storing `true` would leave a cookie behind forever. Removing it returns the
  // browser to holding nothing, which is the state we want most people in.
  it('removes the cookie rather than recording a positive consent', () => {
    setAnalyticsOptOut(true);
    expect(document.cookie).toContain(CONSENT_COOKIE_NAME);

    setAnalyticsOptOut(false);

    expect(document.cookie).not.toContain(CONSENT_COOKIE_NAME);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(resolveConsent()).toEqual({ analytics: true, hasChosen: false });
  });
});

describe('cookie scope', () => {
  it.each([
    ['opndrive.app', true],
    ['docs.opndrive.app', true],
    ['www.opndrive.app', true],
  ])('shares across %s', (hostname, shared) => {
    setHostname(hostname);
    const written: string[] = [];
    const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
      written.push(value);
    });

    setAnalyticsOptOut(true);
    spy.mockRestore();

    expect(written.some((entry) => entry.includes('Domain=.opndrive.app'))).toBe(shared);
  });

  // A Domain attribute the browser does not own is rejected outright, which
  // would silently drop the opt-out on localhost and on self-hosted installs.
  it.each(['localhost', 'my-opndrive.internal', 'opndrive.app.evil.com'])(
    'uses a host-only cookie on %s',
    (hostname) => {
      setHostname(hostname, 'http:');
      const written: string[] = [];
      const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
        written.push(value);
      });

      setAnalyticsOptOut(true);
      spy.mockRestore();

      expect(written.every((entry) => !entry.includes('Domain='))).toBe(true);
    }
  );

  it('omits Secure on plain http so localhost still works', () => {
    setHostname('localhost', 'http:');
    const written: string[] = [];
    const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
      written.push(value);
    });

    setAnalyticsOptOut(true);
    spy.mockRestore();

    expect(written[0]).not.toContain('Secure');
  });

  it('sets Secure over https', () => {
    const written: string[] = [];
    const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
      written.push(value);
    });

    setAnalyticsOptOut(true);
    spy.mockRestore();

    expect(written[0]).toContain('Secure');
    expect(written[0]).toContain('SameSite=Lax');
  });
});

describe('reconciling the two copies', () => {
  it('takes the cookie as the source of truth, since only it crosses origins', () => {
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify({ v: 1, analytics: false, updatedAt: '2026-01-01T00:00:00.000Z' })
    )}; Path=/`;

    expect(resolveConsent().analytics).toBe(false);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}').analytics).toBe(false);
  });

  // A dropped or expired cookie must not silently re-enable analytics for
  // somebody who asked us not to.
  it('honours a local opt-out when the cookie has gone, and rewrites it', () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, analytics: false, updatedAt: '2026-01-01T00:00:00.000Z' })
    );

    expect(resolveConsent()).toEqual({ analytics: false, hasChosen: true });
    expect(document.cookie).toContain(CONSENT_COOKIE_NAME);
  });

  it('discards a stale mirror that claims analytics is allowed', () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, analytics: true, updatedAt: '2026-01-01T00:00:00.000Z' })
    );

    expect(resolveConsent()).toEqual({ analytics: true, hasChosen: false });
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['not json', 'not json at all'],
    ['a future version', JSON.stringify({ v: 99, analytics: false })],
    ['a wrong shape', JSON.stringify({ v: 1, analytics: 'no' })],
  ])('falls back to the default on %s', (_label, stored) => {
    localStorage.setItem(CONSENT_STORAGE_KEY, stored);

    expect(resolveConsent()).toEqual({ analytics: true, hasChosen: false });
  });

  it('survives localStorage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied by policy');
    });

    expect(() => resolveConsent()).not.toThrow();
    expect(resolveConsent().analytics).toBe(true);

    spy.mockRestore();
  });
});

describe('useConsent', () => {
  it('starts allowed and unresolved, then settles', () => {
    const { result } = renderHook(() => useConsent());

    expect(result.current.isResolved).toBe(true);
    expect(result.current.analytics).toBe(true);
  });

  it('reacts to an opt-out made elsewhere in the app', () => {
    const { result } = renderHook(() => useConsent());

    act(() => setAnalyticsOptOut(true));

    expect(result.current.analytics).toBe(false);
    expect(result.current.hasChosen).toBe(true);
  });

  it('reacts to another tab changing the preference', () => {
    const { result } = renderHook(() => useConsent());

    act(() => {
      localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ v: 1, analytics: false, updatedAt: '2026-01-01T00:00:00.000Z' })
      );
      window.dispatchEvent(new Event('storage'));
    });

    expect(result.current.analytics).toBe(false);
  });

  it('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useConsent());

    unmount();
    setAnalyticsOptOut(true);

    expect(result.current.analytics).toBe(true);
  });
});
