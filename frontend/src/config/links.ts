/**
 * Docs is a separate app deployed at its own subdomain, not a route in
 * this app. Override via NEXT_PUBLIC_DOCS_URL for local dev against a
 * docs dev server running elsewhere.
 */
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.opndrive.app';
