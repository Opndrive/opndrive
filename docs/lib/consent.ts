'use client';

import { useEffect, useState } from 'react';

/**
 * Reads the analytics opt-out written by the main app.
 *
 * The docs site is its own Next app and cannot import from `frontend`, so this
 * is a deliberate, small duplicate of the read half of
 * `frontend/src/lib/privacy/consent.ts`. Keep the cookie name and the shape in
 * step with that file.
 *
 * Reading is all this needs to do. The opt-out is offered on the main site's
 * privacy page, and the cookie is scoped to `.opndrive.app` so the choice
 * arrives here on its own.
 */

const CONSENT_COOKIE_NAME = 'opndrive_privacy';

const CONSENT_VERSION = 1;

/** Matches the main app: analytics is on until somebody objects. */
const DEFAULT_ANALYTICS_ALLOWED = true;

function readAnalyticsPreference(): boolean {
  if (typeof document === 'undefined') return DEFAULT_ANALYTICS_ALLOWED;

  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');

    if (name !== CONSENT_COOKIE_NAME) continue;

    try {
      const parsed = JSON.parse(decodeURIComponent(rest.join('=')));

      if (parsed?.v === CONSENT_VERSION && typeof parsed.analytics === 'boolean') {
        return parsed.analytics;
      }
    } catch {
      // Unreadable cookie: fall through to the default.
    }
  }

  return DEFAULT_ANALYTICS_ALLOWED;
}

/**
 * The server cannot read the cookie, so `isResolved` stays false through the
 * first render and nothing should load a script until it flips.
 */
export function useAnalyticsConsent(): { analytics: boolean; isResolved: boolean } {
  const [state, setState] = useState({
    analytics: DEFAULT_ANALYTICS_ALLOWED,
    isResolved: false,
  });

  useEffect(() => {
    setState({ analytics: readAnalyticsPreference(), isResolved: true });
  }, []);

  return state;
}
