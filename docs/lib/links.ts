/**
 * Docs is its own Next app, so it cannot import the frontend's config. These
 * mirror `frontend/src/config/links.ts` - keep the two in step, and note that
 * each app needs NEXT_PUBLIC_DISCORD_URL set in its own environment for the
 * override to apply.
 */
export const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/5t5yMy5NUd';

export const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://opndrive.app';

/**
 * The docs site's own public origin.
 *
 * Unlike the frontend's DOCS_URL, deliberately not read from the environment.
 * Canonical URLs and the sitemap have to name production even when served from
 * a preview deployment, or a search engine would be told the preview is the
 * real page.
 */
export const DOCS_URL = 'https://docs.opndrive.app';
