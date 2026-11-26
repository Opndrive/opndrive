/**
 * Which content security policy a page is served with.
 *
 * Public pages (the home page, the blog and the legal pages) never talk to a
 * storage provider, so they get a policy that lets the page connect to this
 * site and, when analytics is built in, to the analytics host - nowhere else.
 * The app has to reach whatever storage endpoint the user typed in, so it
 * keeps the broad policy in csp.ts and never includes the analytics host.
 *
 * A document keeps the policy it was loaded with for as long as it lives, and
 * Next.js moves between pages without loading a new document. So a link from
 * a public page into the app has to be a full page load: see
 * `needsFullPageLoad`, and PublicPolicyReload for the case a link misses.
 */
export type PageProfile = 'public' | 'app';

const PUBLIC_PAGES = [/^\/$/, /^\/blog(\/[^/]+)?\/?$/, /^\/(privacy|terms)\/?$/];

export function pageProfileFor(pathname: string): PageProfile {
  return PUBLIC_PAGES.some((pattern) => pattern.test(pathname)) ? 'public' : 'app';
}

/** Whether a same-site link leads into the app, and so must load a new document. */
export function needsFullPageLoad(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;

  const pathname = href.split(/[?#]/)[0];
  return pageProfileFor(pathname) === 'app';
}

/** Set once by the root layout's inline script, from the policy the document arrived with. */
export const PAGE_PROFILE_GLOBAL = '__opndrivePageProfile';
