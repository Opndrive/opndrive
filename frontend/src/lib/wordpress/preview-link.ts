import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The signed link WordPress's Preview button opens.
 *
 * wordpress/mu-plugins/opndrive-preview.php builds it: the post's ID, an
 * expiry (Unix seconds, an hour ahead) and an HMAC-SHA256 of `<id>.<expiry>`
 * under a secret both sides hold (BLOG_PREVIEW_SECRET here). Checking it here
 * means a preview needs no WordPress login in this browser, and a link that
 * leaks stops working within the hour. The secret itself never appears in a
 * URL, so it never reaches a log.
 */

/** A link claiming to last longer than this was not made by the plugin. */
export const PREVIEW_LINK_MAX_LIFETIME_SECONDS = 2 * 60 * 60;

/** Shorter secrets are refused, so a weak one cannot be configured by accident. */
export const PREVIEW_SECRET_MIN_LENGTH = 32;

export type PreviewLinkCheck =
  | { ok: true; postId: number }
  | { ok: false; reason: 'not-configured' | 'malformed' | 'expired' | 'bad-signature' };

/** What the plugin signs. Exported for tests, which sign links the same way. */
export function signPreviewLink(postId: number, expires: number, secret: string): string {
  return createHmac('sha256', secret).update(`${postId}.${expires}`).digest('hex');
}

export function checkPreviewLink(
  link: { id: string | null; exp: string | null; sig: string | null },
  secret: string | undefined,
  nowSeconds: number
): PreviewLinkCheck {
  if (!secret || secret.length < PREVIEW_SECRET_MIN_LENGTH) {
    return { ok: false, reason: 'not-configured' };
  }

  const { id, exp, sig } = link;
  if (!id || !/^[1-9]\d{0,15}$/.test(id) || !exp || !/^\d{1,12}$/.test(exp)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!sig || !/^[0-9a-f]{64}$/.test(sig)) {
    return { ok: false, reason: 'malformed' };
  }

  const postId = Number(id);
  const expires = Number(exp);
  if (expires > nowSeconds + PREVIEW_LINK_MAX_LIFETIME_SECONDS) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = Buffer.from(signPreviewLink(postId, expires, secret), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(sig, 'hex'))) {
    return { ok: false, reason: 'bad-signature' };
  }

  // Checked after the signature, so an unsigned link learns nothing from it.
  if (expires < nowSeconds) return { ok: false, reason: 'expired' };

  return { ok: true, postId };
}
