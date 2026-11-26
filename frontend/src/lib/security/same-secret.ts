import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Whether a secret someone sent matches ours, in time that does not depend on
 * how much of it matched. Both sides are hashed first, so the comparison is
 * always between two equal-length digests and the length of the real secret
 * is not given away either.
 */
export function sameSecret(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;

  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(given), digest(expected));
}
