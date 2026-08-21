'use client';

import { useEffect, useState } from 'react';

/**
 * Where the analytics opt-out lives.
 *
 * Analytics here runs on legitimate interests rather than consent: it is
 * cookieless, aggregate, and builds no profile. So the default is on and this
 * module records an *objection*, not a permission. That is the whole reason
 * there is no banner.
 *
 * Two things make the storage design less obvious than it looks.
 *
 * The opt-out has to reach docs.opndrive.app, which is a different origin, and
 * localStorage cannot cross origins. Only a cookie scoped to `.opndrive.app`
 * can. Which produces an irony worth being deliberate about: recording that
 * somebody wants less tracking would set the first cookie either site has ever
 * used.
 *
 * So the cookie is written *only* when somebody actually opts out. Take no
 * action and nothing is ever stored, which keeps the site genuinely
 * cookie-free for almost everyone. And the cookie that does get written
 * records a preference the user explicitly asked for, which makes it strictly
 * necessary under ePrivacy Article 5(3) and exempt from needing consent of its
 * own. Opting back in deletes it again rather than storing `true`.
 */

export const CONSENT_COOKIE_NAME = 'opndrive_privacy';

/** Same name as the cookie: one concept, one thing to look for in devtools. */
export const CONSENT_STORAGE_KEY = 'opndrive_privacy';

/**
 * Analytics is allowed until somebody says otherwise. This is the single
 * constant to flip if the legal posture ever moves from legitimate interests
 * to consent - everything downstream reads through here.
 */
export const DEFAULT_ANALYTICS_ALLOWED = true;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Bumping this invalidates stored state whose meaning has changed. */
const CONSENT_VERSION = 1;

const CHANGE_EVENT = 'opndrive:consent-change';

export interface ConsentState {
  v: typeof CONSENT_VERSION;
  analytics: boolean;
  updatedAt: string;
}

export interface ResolvedConsent {
  analytics: boolean;
  /** True only if the visitor actively chose. Absence of choice is not a choice. */
  hasChosen: boolean;
}

const DEFAULT_RESOLVED: ResolvedConsent = {
  analytics: DEFAULT_ANALYTICS_ALLOWED,
  hasChosen: false,
};

/**
 * The domain the cookie is scoped to, or null for a host-only cookie.
 *
 * `.opndrive.app` covers the app and the docs subdomain together. Anywhere
 * else - localhost, a preview deployment, somebody's self-hosted copy - that
 * domain would be rejected by the browser, so those get a host-only cookie
 * and simply do not share the preference across hosts.
 */
function cookieDomain(hostname: string): string | null {
  if (hostname === 'opndrive.app' || hostname.endsWith('.opndrive.app')) {
    return '.opndrive.app';
  }

  return null;
}

function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as ConsentState).v === CONSENT_VERSION &&
      typeof (parsed as ConsentState).analytics === 'boolean'
    ) {
      return parsed as ConsentState;
    }
  } catch {
    // Corrupt or from a future version: fall through and treat as unset.
  }

  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  for (const part of document.cookie.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

function writeCookie(value: string): void {
  const domain = cookieDomain(window.location.hostname);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';

  document.cookie =
    `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}` +
    `; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}` +
    (domain ? `; Domain=${domain}` : '');
}

function deleteCookie(): void {
  const domain = cookieDomain(window.location.hostname);

  // Clear both the domain-scoped and host-only forms. A cookie written before
  // a domain change would otherwise survive and keep overriding the choice.
  document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;

  if (domain) {
    document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Domain=${domain}`;
  }
}

function readLocalMirror(): ConsentState | null {
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    // Storage can throw in private modes or when disabled by policy.
    return null;
  }
}

function writeLocalMirror(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    }
  } catch {
    // The cookie is the source of truth; losing the mirror is survivable.
  }
}

/**
 * Resolves the current preference.
 *
 * The cookie wins because it is the only copy that crosses between the app and
 * the docs site. If it is gone but the local mirror still says opted out, the
 * opt-out is honoured anyway and the cookie is rewritten - erring toward the
 * more private answer, and healing a cookie the user's browser dropped.
 */
export function resolveConsent(): ResolvedConsent {
  if (typeof window === 'undefined') return DEFAULT_RESOLVED;

  const fromCookie = parseConsent(readCookie(CONSENT_COOKIE_NAME));

  if (fromCookie) {
    writeLocalMirror(JSON.stringify(fromCookie));
    return { analytics: fromCookie.analytics, hasChosen: true };
  }

  const fromMirror = readLocalMirror();

  if (fromMirror) {
    if (!fromMirror.analytics) {
      writeCookie(JSON.stringify(fromMirror));
      return { analytics: false, hasChosen: true };
    }

    // A mirror saying "allowed" is stale by definition: opting back in clears
    // both sides, so this can only be left over. Drop it.
    writeLocalMirror(null);
  }

  return DEFAULT_RESOLVED;
}

/** Convenience for non-React callers. */
export function mayLoadAnalytics(): boolean {
  return resolveConsent().analytics;
}

/**
 * Records or withdraws an objection to analytics.
 *
 * Opting back in removes the cookie entirely rather than storing `true`, which
 * returns the browser to holding nothing at all.
 */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (typeof window === 'undefined') return;

  if (optedOut) {
    const state: ConsentState = {
      v: CONSENT_VERSION,
      analytics: false,
      updatedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(state);

    writeCookie(serialized);
    writeLocalMirror(serialized);
  } else {
    deleteCookie();
    writeLocalMirror(null);
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface ConsentHookState extends ResolvedConsent {
  /**
   * False until the first client effect has read the cookie. Nothing that
   * loads a script should act while this is false - see AnalyticsGate.
   */
  isResolved: boolean;
}

/** Subscribes to the analytics preference. */
export function useConsent(): ConsentHookState {
  const [state, setState] = useState<ConsentHookState>(() => ({
    ...DEFAULT_RESOLVED,
    isResolved: false,
  }));

  useEffect(() => {
    const sync = () => {
      const next = resolveConsent();

      setState((prev) =>
        prev.isResolved && prev.analytics === next.analytics && prev.hasChosen === next.hasChosen
          ? prev
          : { ...next, isResolved: true }
      );
    };

    sync();

    // `storage` covers another tab on this origin changing the mirror.
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return state;
}
