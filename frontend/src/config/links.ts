/**
 * The canonical origin for this site.
 *
 * Everything that emits an absolute URL must read this: `metadataBase` in the
 * root layout, the sitemap and robots.txt. They previously disagreed, with
 * metadataBase on www and the sitemap on the bare domain, which meant every
 * URL we submitted for indexing carried a canonical pointing at a different
 * host. That splits ranking signals across two origins, which is the exact
 * problem canonical tags exist to prevent.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://opndrive.app';

/**
 * Docs is a separate app deployed at its own subdomain, not a route in
 * this app. Override via NEXT_PUBLIC_DOCS_URL for local dev against a
 * docs dev server running elsewhere.
 */
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.opndrive.app';

/**
 * Community Discord invite. Override via NEXT_PUBLIC_DISCORD_URL so the invite
 * can be rotated without a code change.
 */
export const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/sTVSZUumz';
