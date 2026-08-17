/**
 * getParentPrefix.
 *
 * Used to send the user somewhere real after the folder they were in was
 * deleted, so the answer has to hold for a bucket root prefix as well as a
 * plain one, and an empty result has to mean the root rather than "no idea".
 */

import { describe, it, expect } from 'vitest';
import { getParentPrefix } from './folder-navigation';

describe('getParentPrefix', () => {
  it('gives the folder above', () => {
    expect(getParentPrefix('docs/2024/raw/')).toBe('docs/2024/');
  });

  it('gives the root for a top level folder', () => {
    expect(getParentPrefix('docs/')).toBe('');
  });

  it('takes a prefix without a trailing slash', () => {
    expect(getParentPrefix('docs/2024')).toBe('docs/');
  });

  it('stops at the bucket prefix the session is pinned to', () => {
    expect(getParentPrefix('team/docs/')).toBe('team/');
  });

  it('does not walk out of the root', () => {
    expect(getParentPrefix('/')).toBe('');
    expect(getParentPrefix('')).toBe('');
  });

  it('keeps a name that happens to contain the parent name', () => {
    expect(getParentPrefix('docs/docs/')).toBe('docs/');
  });
});
