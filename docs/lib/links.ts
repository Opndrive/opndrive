/**
 * Docs is its own Next app, so it cannot import the frontend's config. These
 * mirror `frontend/src/config/links.ts` - keep the two in step, and note that
 * each app needs NEXT_PUBLIC_DISCORD_URL set in its own environment for the
 * override to apply.
 */
export const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/sTVSZUumz';

export const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://opndrive.app';
