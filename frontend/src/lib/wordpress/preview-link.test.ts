import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPreviewLink, signPreviewLink } from './preview-link';
import { sameSecret } from '../security/same-secret';

const SECRET = 'a'.repeat(40);
const NOW = 1_800_000_000;

function link(id: number, expires: number, secret = SECRET) {
  return { id: String(id), exp: String(expires), sig: signPreviewLink(id, expires, secret) };
}

describe('a preview link', () => {
  it('opens the post it was signed for', () => {
    expect(checkPreviewLink(link(42, NOW + 3600), SECRET, NOW)).toEqual({ ok: true, postId: 42 });
  });

  it('stops working once it expires', () => {
    expect(checkPreviewLink(link(42, NOW - 1), SECRET, NOW)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('is refused when signed with another secret', () => {
    expect(checkPreviewLink(link(42, NOW + 60, 'b'.repeat(40)), SECRET, NOW).ok).toBe(false);
  });

  it('is refused when the post ID is changed', () => {
    const forged = { ...link(42, NOW + 60), id: '43' };
    expect(checkPreviewLink(forged, SECRET, NOW)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('is refused when the expiry is pushed back', () => {
    const forged = { ...link(42, NOW + 60), exp: String(NOW + 3600) };
    expect(checkPreviewLink(forged, SECRET, NOW)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('is refused when it claims to last longer than any real link', () => {
    expect(checkPreviewLink(link(42, NOW + 3 * 3600), SECRET, NOW).ok).toBe(false);
  });

  it.each([
    { id: null, exp: '1', sig: 'a'.repeat(64) },
    { id: '0', exp: String(NOW), sig: 'a'.repeat(64) },
    { id: '42/../1', exp: String(NOW), sig: 'a'.repeat(64) },
    { id: '42', exp: 'soon', sig: 'a'.repeat(64) },
    { id: '42', exp: String(NOW), sig: 'not-hex' },
  ])('is refused when malformed: %o', (bad) => {
    expect(checkPreviewLink(bad, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('is refused everywhere when no secret, or a short one, is configured', () => {
    expect(checkPreviewLink(link(42, NOW + 60), undefined, NOW).ok).toBe(false);
    expect(checkPreviewLink(link(42, NOW + 60, 'short'), 'short', NOW)).toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  // The PHP side signs "<id>.<expiry>" with HMAC-SHA256 into lowercase hex,
  // and sends id, exp and sig. If that drifts, every preview link breaks.
  it('is signed the same way the WordPress plugin signs it', () => {
    const plugin = readFileSync(
      join(process.cwd(), '..', 'wordpress', 'mu-plugins', 'opndrive-preview.php'),
      'utf8'
    );

    expect(plugin).toContain(
      "hash_hmac( 'sha256', $post->ID . '.' . $expires, OPNDRIVE_PREVIEW_SECRET )"
    );
    expect(plugin).toMatch(/'id'\s+=> \$post->ID/);
    expect(plugin).toMatch(/'exp'\s+=> \$expires/);
    expect(plugin).toMatch(/'sig'\s+=> \$signature/);
    expect(plugin).toContain("'api/preview'");
  });
});

describe('sameSecret', () => {
  it('matches only the exact secret', () => {
    expect(sameSecret('s3cret-value', 's3cret-value')).toBe(true);
    expect(sameSecret('s3cret-valuf', 's3cret-value')).toBe(false);
    expect(sameSecret('s3cret', 's3cret-value')).toBe(false);
    expect(sameSecret('', 's3cret-value')).toBe(false);
    expect(sameSecret(null, 's3cret-value')).toBe(false);
  });
});
