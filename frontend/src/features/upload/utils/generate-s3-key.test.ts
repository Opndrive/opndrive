/**
 * generateS3Key decides where an object lands in the bucket, so a path that
 * comes in with a stray slash, or none, must still put the file in the folder
 * the user is in - not at the root, and not under an empty-named folder.
 */

import { describe, expect, it } from 'vitest';
import { generateS3Key } from './generate-s3-key';

describe('generateS3Key', () => {
  it.each(['', '/'])('puts a file at the root for the root path %j', (path) => {
    expect(generateS3Key('a.txt', path)).toBe('a.txt');
  });

  it('keys a file under its folder', () => {
    expect(generateS3Key('a.txt', 'docs/')).toBe('docs/a.txt');
  });

  it('adds the slash a folder path came without', () => {
    expect(generateS3Key('a.txt', 'docs/2024')).toBe('docs/2024/a.txt');
  });

  it('drops a leading slash, which S3 would keep as an empty first folder', () => {
    expect(generateS3Key('a.txt', '/docs/')).toBe('docs/a.txt');
    expect(generateS3Key('a.txt', '/docs')).toBe('docs/a.txt');
  });

  it('keeps the file name as it is', () => {
    expect(generateS3Key('my report (1).final.pdf', 'docs/')).toBe('docs/my report (1).final.pdf');
  });
});
