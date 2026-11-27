/**
 * The drive store's cache keys, from one place (#71). The folder on screen,
 * the listing it is stored under and the prefix S3 is asked for must agree,
 * or a folder already in the cache is fetched again as if it were not.
 */
import { describe, expect, it } from 'vitest';
import { apiPrefixOf, currentKey, toCacheKey } from './data-context';

describe('toCacheKey', () => {
  it('keys the bucket root as "/"', () => {
    expect(toCacheKey('')).toBe('/');
  });

  it('keys every other folder by its own prefix', () => {
    expect(toCacheKey('docs/')).toBe('docs/');
    expect(toCacheKey('users/alice/photos/')).toBe('users/alice/photos/');
  });
});

describe('apiPrefixOf', () => {
  it('asks S3 for the root as the empty prefix', () => {
    expect(apiPrefixOf('/')).toBe('');
  });

  it('asks for every other folder by its key', () => {
    expect(apiPrefixOf('docs/')).toBe('docs/');
  });

  it('undoes toCacheKey for every prefix', () => {
    for (const prefix of ['', 'docs/', 'users/alice/']) {
      expect(apiPrefixOf(toCacheKey(prefix))).toBe(prefix);
    }
  });
});

describe('currentKey', () => {
  it('is null until both prefixes are known', () => {
    expect(currentKey({ currentPrefix: null, rootPrefix: '/' })).toBeNull();
    expect(currentKey({ currentPrefix: 'docs/', rootPrefix: null })).toBeNull();
  });

  it('keys the root of a whole-bucket connection as "/"', () => {
    expect(currentKey({ currentPrefix: '/', rootPrefix: '/' })).toBe('/');
    expect(currentKey({ currentPrefix: '', rootPrefix: '/' })).toBe('/');
  });

  it('keys a folder by its prefix, whatever the connection root', () => {
    expect(currentKey({ currentPrefix: 'docs/', rootPrefix: '/' })).toBe('docs/');
    expect(currentKey({ currentPrefix: 'users/alice/docs/', rootPrefix: 'users/alice/' })).toBe(
      'users/alice/docs/'
    );
  });

  it('agrees with the listing key and the S3 prefix for the same folder', () => {
    const key = currentKey({ currentPrefix: 'docs/', rootPrefix: '/' });
    expect(key).toBe(toCacheKey('docs/'));
    expect(apiPrefixOf(key!)).toBe('docs/');
  });
});
