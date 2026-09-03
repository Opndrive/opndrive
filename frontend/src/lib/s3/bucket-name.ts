/**
 * What a bucket may be called.
 *
 * Unlike a folder name, which is just an object key and may be any UTF-8 the
 * user likes, a bucket name is part of a hostname. S3 enforces a narrow rule
 * set on it and rejects anything else with `InvalidBucketName` - an error that
 * arrives after the request, names no rule, and tells the person who typed it
 * nothing about which of the eight rules they broke.
 *
 * So the rules are checked here, on the way in, and each one says what it
 * wants. This is deliberately a copy of AWS's published rules for general
 * purpose buckets rather than a guess at them, because a validator that is
 * stricter than the service refuses names that would have worked, and one that
 * is looser just moves the failure back to where it was.
 *
 * S3-compatible providers vary - some accept names S3 will not. Being wrong in
 * that direction is the safe one: the name is refused before a request is made
 * rather than a bucket being created that S3 tooling cannot address later.
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 63;

/** Lowercase letters, digits, dots and hyphens. Nothing else is addressable. */
const ALLOWED_CHARACTERS = /^[a-z0-9.-]+$/;

/** Must open and close on a letter or a digit - not a dot, not a hyphen. */
const STARTS_AND_ENDS_ALPHANUMERIC = /^[a-z0-9].*[a-z0-9]$/;

/**
 * Four dot-separated numbers. Such a name is rejected by S3 because it would
 * be ambiguous with the path-style endpoint's address.
 */
const IP_ADDRESS = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Prefixes and suffixes S3 keeps for itself: punycode, its internal namespace,
 * the documentation's example names, and the shapes it uses for access points,
 * Object Lambda, Multi-Region Access Points, directory buckets and table
 * buckets. A bucket cannot be created with any of them.
 */
const RESERVED_PREFIXES = ['xn--', 'sthree-', 'amzn-s3-demo-'];
const RESERVED_SUFFIXES = ['-s3alias', '--ol-s3', '.mrap', '--x-s3', '--table-s3'];

/**
 * Returns null when the name is usable, otherwise a message to show the user.
 *
 * Validates the trimmed name, because that is what callers go on to create.
 */
export function describeBucketNameError(bucketName: string): string | null {
  const name = bucketName.trim();

  if (!name) {
    return 'Bucket name cannot be empty.';
  }

  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) {
    return `Bucket names must be ${MIN_LENGTH} to ${MAX_LENGTH} characters long.`;
  }

  // Called out on its own because it is far and away the most common mistake,
  // and "only lowercase letters, numbers, dots and hyphens" reads as a list to
  // check rather than as the answer.
  if (name !== name.toLowerCase()) {
    return 'Bucket names cannot contain uppercase letters.';
  }

  if (!ALLOWED_CHARACTERS.test(name)) {
    return 'Bucket names can only use lowercase letters, numbers, dots and hyphens.';
  }

  if (!STARTS_AND_ENDS_ALPHANUMERIC.test(name)) {
    return 'Bucket names must start and end with a letter or a number.';
  }

  if (name.includes('..')) {
    return 'Bucket names cannot contain two dots in a row.';
  }

  if (IP_ADDRESS.test(name)) {
    return 'Bucket names cannot look like an IP address.';
  }

  const reservedPrefix = RESERVED_PREFIXES.find((prefix) => name.startsWith(prefix));
  if (reservedPrefix) {
    return `Bucket names cannot start with "${reservedPrefix}" - S3 reserves it.`;
  }

  const reservedSuffix = RESERVED_SUFFIXES.find((suffix) => name.endsWith(suffix));
  if (reservedSuffix) {
    return `Bucket names cannot end with "${reservedSuffix}" - S3 reserves it.`;
  }

  return null;
}

/** Yes or no, for call sites that do not show the reason. */
export const isValidBucketName = (bucketName: string): boolean =>
  describeBucketNameError(bucketName) === null;

/**
 * A caveat rather than a rule, so it never blocks creation.
 *
 * A dot in the name is legal and always has been, but it breaks virtual-host
 * style addressing over TLS: the wildcard certificate `*.s3.amazonaws.com`
 * does not match `my.bucket.s3.amazonaws.com`, so every HTTPS request to it
 * fails certificate validation. AWS has recommended against dots for years,
 * and someone about to find that out from a browser console is better told now.
 */
export function describeBucketNameCaveat(bucketName: string): string | null {
  if (!bucketName.trim().includes('.')) return null;

  return 'Dots break HTTPS access for some tools. A hyphen is the safer separator.';
}
