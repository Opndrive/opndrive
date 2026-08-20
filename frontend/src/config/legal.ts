/**
 * Shared facts for the legal pages.
 *
 * Kept here rather than inline so the privacy policy, the terms and the footer
 * cannot disagree about a date or an address.
 */

/**
 * Shown on both legal pages. Update it in the same commit as any change to
 * what we collect - the git history of these files is the real changelog.
 */
export const LEGAL_LAST_UPDATED = '2026-08-20';

/** Where privacy questions go. Security reports go through SECURITY.md. */
export const PRIVACY_CONTACT_EMAIL = 'privacy@opndrive.app';

export const SECURITY_ADVISORY_URL = 'https://github.com/Opndrive/opndrive/security/advisories/new';

export const REPOSITORY_URL = 'https://github.com/Opndrive/opndrive';

export const LICENSE_NAME = 'AGPL-3.0';

export const LICENSE_URL = 'https://github.com/Opndrive/opndrive/blob/main/LICENSE';

/** The deployment these documents describe. Self-hosted installs are not it. */
export const HOSTED_APP_DOMAIN = 'opndrive.app';

export const HOSTED_DOCS_DOMAIN = 'docs.opndrive.app';

export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
