/**
 * What a bucket may be called.
 *
 * These rules are AWS's, copied rather than invented, and the tests are written
 * the same way round: each one names the rule and the shape of name that breaks
 * it. A validator that is stricter than S3 refuses names that would have
 * worked, and one that is looser just moves the failure back to the request -
 * so both directions are checked, and the accepted list below is as important
 * as the rejected one.
 */

import { describe, it, expect } from 'vitest';
import {
  describeBucketNameCaveat,
  describeBucketNameError,
  isValidBucketName,
} from './bucket-name';

describe('names S3 accepts', () => {
  const accepted = [
    'my-bucket',
    'abc',
    'a'.repeat(63),
    'bucket123',
    '123bucket',
    'my.bucket.with.dots',
    'a-b-c-1-2-3',
  ];

  it.each(accepted)('accepts %s', (name) => {
    expect(describeBucketNameError(name)).toBeNull();
    expect(isValidBucketName(name)).toBe(true);
  });

  it('judges the trimmed name, because that is what gets created', () => {
    expect(describeBucketNameError('  my-bucket  ')).toBeNull();
  });
});

describe('names S3 refuses', () => {
  it('refuses an empty name', () => {
    expect(describeBucketNameError('')).toMatch(/cannot be empty/i);
    expect(describeBucketNameError('   ')).toMatch(/cannot be empty/i);
  });

  it('refuses one too short or too long', () => {
    expect(describeBucketNameError('ab')).toMatch(/3 to 63/);
    expect(describeBucketNameError('a'.repeat(64))).toMatch(/3 to 63/);
  });

  it('names uppercase as the problem rather than listing the legal characters', () => {
    // Far and away the most common mistake, and "only lowercase letters,
    // numbers, dots and hyphens" reads as a list to check rather than an answer.
    expect(describeBucketNameError('MyBucket')).toMatch(/uppercase/i);
  });

  it('refuses characters that are not addressable', () => {
    expect(describeBucketNameError('my_bucket')).toMatch(/lowercase letters, numbers/i);
    expect(describeBucketNameError('my bucket')).toMatch(/lowercase letters, numbers/i);
    expect(describeBucketNameError('my/bucket')).toMatch(/lowercase letters, numbers/i);
  });

  it('refuses one that does not open and close on a letter or a digit', () => {
    expect(describeBucketNameError('-bucket')).toMatch(/start and end/i);
    expect(describeBucketNameError('bucket-')).toMatch(/start and end/i);
    expect(describeBucketNameError('.bucket')).toMatch(/start and end/i);
    expect(describeBucketNameError('bucket.')).toMatch(/start and end/i);
  });

  it('refuses two dots in a row', () => {
    expect(describeBucketNameError('my..bucket')).toMatch(/two dots/i);
  });

  it('refuses a name that reads as an IP address', () => {
    // Ambiguous with the path-style endpoint's own address.
    expect(describeBucketNameError('192.168.5.4')).toMatch(/ip address/i);
  });

  it('refuses the prefixes and suffixes S3 keeps for itself', () => {
    expect(describeBucketNameError('xn--bucket')).toMatch(/reserves/i);
    expect(describeBucketNameError('sthree-bucket')).toMatch(/reserves/i);
    expect(describeBucketNameError('amzn-s3-demo-bucket')).toMatch(/reserves/i);
    expect(describeBucketNameError('bucket-s3alias')).toMatch(/reserves/i);
    expect(describeBucketNameError('bucket--ol-s3')).toMatch(/reserves/i);
    expect(describeBucketNameError('bucket.mrap')).toMatch(/reserves/i);
    expect(describeBucketNameError('bucket--x-s3')).toMatch(/reserves/i);
  });
});

/**
 * The one legal choice worth warning about.
 *
 * A dot is allowed and always has been, but the wildcard certificate
 * `*.s3.amazonaws.com` does not match `my.bucket.s3.amazonaws.com`, so HTTPS to
 * a dotted bucket fails certificate validation in some tools. Being told now
 * beats finding out from a browser console.
 */
describe('the dot caveat', () => {
  it('warns about a dot', () => {
    expect(describeBucketNameCaveat('my.bucket')).toMatch(/https/i);
  });

  it('says nothing about a name without one', () => {
    expect(describeBucketNameCaveat('my-bucket')).toBeNull();
  });

  it('never blocks: a dotted name is still valid', () => {
    expect(describeBucketNameError('my.bucket')).toBeNull();
  });
});
