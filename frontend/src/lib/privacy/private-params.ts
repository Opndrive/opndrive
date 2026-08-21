'use client';

import { useEffect, useState } from 'react';

/**
 * Route params that carry the user's own data, kept in the hash fragment.
 *
 * The hash is the one part of a URL a browser never transmits. It is absent
 * from the request line, so it never reaches Vercel's edge logs, and it is
 * stripped from the `Referer` sent to any third party. A query string is in
 * both. Search terms and S3 object keys therefore live here.
 *
 * The hash also keeps preview and search links shareable and leaves the back
 * button working, which stashing the values in sessionStorage would not. The
 * trade is that the value stays visible in the address bar and in browser
 * history - that is the user's own data on the user's own machine, and the
 * leak being closed here is transmission.
 *
 * Analytics redaction in `redact-url.ts` drops the hash as well, so a page
 * view reports the route and nothing else.
 */
export const PRIVATE_PARAM_QUERY = 'q';
export const PRIVATE_PARAM_PREVIEW = 'preview';

/**
 * `history.pushState` does not fire `hashchange`, so a programmatic update has
 * to announce itself. Every reader of private params listens for this.
 */
const CHANGE_EVENT = 'opndrive:private-params-change';

type PrivateParamValues = Record<string, string | undefined>;

/** Reads the private params of the current URL. Empty during SSR. */
export function readPrivateParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();

  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

/** Encodes params as a hash fragment, or an empty string if there are none. */
export function buildPrivateHash(params: PrivateParamValues): string {
  const encoded = new URLSearchParams();

  for (const [name, value] of Object.entries(params)) {
    if (value) encoded.set(name, value);
  }

  const serialized = encoded.toString();

  return serialized ? `#${serialized}` : '';
}

/** A href for `pathname` carrying `params` in its hash. */
export function withPrivateParams(pathname: string, params: PrivateParamValues): string {
  return `${pathname}${buildPrivateHash(params)}`;
}

/**
 * Replaces the private params of the current route without navigating.
 *
 * Next patches the history methods, so going through them keeps its router in
 * step rather than leaving it pointing at a stale URL.
 */
export function setPrivateParams(
  params: PrivateParamValues,
  { replace = false }: { replace?: boolean } = {}
): void {
  if (typeof window === 'undefined') return;

  const { pathname, search } = window.location;
  const url = `${pathname}${search}${buildPrivateHash(params)}`;

  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Navigates to `pathname` with private params attached.
 *
 * A same-route change goes through the history API instead of the router:
 * Next's `pushState` does not fire `hashchange`, so a hash-only `router.push`
 * would leave every reader stuck on the previous value.
 */
export function pushPrivateParams(
  router: { push: (href: string) => void },
  pathname: string,
  params: PrivateParamValues
): void {
  if (typeof window !== 'undefined' && window.location.pathname === pathname) {
    setPrivateParams(params);
    return;
  }

  router.push(withPrivateParams(pathname, params));
}

interface PrivateParamsState {
  params: URLSearchParams;
  /**
   * False until the first client effect has run. The server cannot see the
   * hash, so anything that would render an "empty" state has to wait rather
   * than flash it on every load.
   */
  isHydrated: boolean;
}

/** Subscribes to the private params of the current URL. */
export function usePrivateParams(): PrivateParamsState {
  const [state, setState] = useState<PrivateParamsState>(() => ({
    params: new URLSearchParams(),
    isHydrated: false,
  }));

  useEffect(() => {
    const sync = () => {
      const next = readPrivateParams();

      // A fresh URLSearchParams every event would re-render every consumer on
      // any history change, including ones that left the params untouched.
      setState((prev) =>
        prev.isHydrated && prev.params.toString() === next.toString()
          ? prev
          : { params: next, isHydrated: true }
      );
    };

    sync();

    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    window.addEventListener(CHANGE_EVENT, sync);

    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return state;
}

/** Subscribes to a single private param. */
export function usePrivateParam(name: string): { value: string; isHydrated: boolean } {
  const { params, isHydrated } = usePrivateParams();

  return { value: params.get(name) ?? '', isHydrated };
}
