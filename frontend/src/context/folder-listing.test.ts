/**
 * The pure parts of a folder listing: S3's order, pages, and the rules for
 * putting a row into a listing that is only partly read.
 */

import { describe, expect, it } from 'vitest';
import {
  appendPage,
  compareKeys,
  emptyListing,
  keysToEvict,
  listingOf,
  loadedEnd,
  mergeFirstPage,
  newestFirst,
  toPage,
  withFile,
  withinLoaded,
  type FolderListing,
} from './folder-listing';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

const file = (Key: string, minutesAgo = 0) =>
  ({
    Key,
    id: Key,
    name: Key,
    extension: 'txt',
    size: { value: 1, unit: 'B' },
    lastModified: new Date(Date.UTC(2026, 0, 1) - minutesAgo * 60_000),
  }) as FileItem;
const folder = (Prefix: string) => ({ Prefix, id: Prefix, name: Prefix }) as Folder;
const page = (files: string[], folders: string[] = [], cursor?: string) => ({
  files: files.map((key) => file(key)),
  folders: folders.map(folder),
  cursor,
  complete: cursor === undefined,
});
const keys = (listing: FolderListing) => ({
  folders: listing.folders.map((f) => f.Prefix),
  files: listing.files.map((f) => f.Key),
});

describe('compareKeys: S3 order', () => {
  it('sorts by bytes, not alphabetically: capitals first, digits by character', () => {
    const sorted = ['b.txt', 'B.txt', 'file10', 'file2', 'a.txt'].sort(compareKeys);
    expect(sorted).toEqual(['B.txt', 'a.txt', 'b.txt', 'file10', 'file2']);
  });

  it('puts a folder after a file sharing its name and a dot, as S3 does', () => {
    // '.' is 0x2E and '/' is 0x2F.
    expect(['a/', 'a.txt'].sort(compareKeys)).toEqual(['a.txt', 'a/']);
  });

  it('orders by code point where JavaScript string comparison does not', () => {
    // S3 compares UTF-8 bytes: U+FF71 (EF BD B1) comes before an emoji
    // (F0 9F ...). JavaScript's `<` compares UTF-16 units and gets it backwards.
    const halfwidth = 'ｱ.txt';
    const emoji = '😀.txt';
    expect(emoji < halfwidth).toBe(true);
    expect(compareKeys(halfwidth, emoji)).toBeLessThan(0);
  });

  it('puts a prefix before the longer key it starts', () => {
    expect(compareKeys('abc', 'abcd')).toBeLessThan(0);
    expect(compareKeys('abc', 'abc')).toBe(0);
  });
});

describe('toPage', () => {
  it('drops the marker object of the folder itself and empty prefixes', () => {
    const result = toPage(
      {
        files: [{ Key: 'docs/' }, { Key: 'docs/a.txt' }],
        folders: [{ Prefix: '' }, { Prefix: 'docs/x/' }],
      },
      'docs/'
    );
    expect(result.files.map((f) => f.Key)).toEqual(['docs/a.txt']);
    expect(result.folders.map((f) => f.Prefix)).toEqual(['docs/x/']);
  });

  it('is complete unless S3 says there is more and how to get it', () => {
    expect(toPage({ files: [], folders: [], isTruncated: true, nextToken: 't' }, '').complete).toBe(
      false
    );
    expect(toPage({ files: [], folders: [], isTruncated: true }, '').complete).toBe(true);
    expect(toPage({ files: [], folders: [], isTruncated: false }, '').complete).toBe(true);
  });
});

describe('appendPage', () => {
  it('adds a page after what is loaded and takes its cursor', () => {
    const listing = listingOf({ files: [file('a')], cursor: 't1' });
    const result = appendPage(listing, page(['b'], ['c/'], 't2'));

    expect(keys(result)).toEqual({ folders: ['c/'], files: ['a', 'b'] });
    expect(result).toMatchObject({ cursor: 't2', complete: false });
  });

  it('drops a key it already holds instead of listing it twice', () => {
    const listing = listingOf({ files: [file('a')], cursor: 't1' });
    expect(keys(appendPage(listing, page(['a', 'b']))).files).toEqual(['a', 'b']);
  });
});

describe('mergeFirstPage', () => {
  it('fills an empty listing with the page', () => {
    const result = mergeFirstPage(emptyListing(0), page(['a'], [], 't1'));
    expect(result).toMatchObject({ loaded: true, complete: false, cursor: 't1' });
  });

  it('keeps rows beyond the fresh page, with the cursor that continues after them', () => {
    const listing = listingOf({
      files: [file('a'), file('c'), file('m'), file('z')],
      cursor: 't2',
    });
    // The fresh page runs to 'd': 'c' was inside it and is gone; 'm' and 'z'
    // lie beyond it, where page 1 says nothing, and stay.
    const result = mergeFirstPage(listing, page(['a', 'b', 'd'], [], 'fresh'));

    expect(keys(result).files).toEqual(['a', 'b', 'd', 'm', 'z']);
    expect(result.cursor).toBe('t2');
  });

  it('takes the fresh cursor when the fresh page reaches further', () => {
    const listing = listingOf({ files: [file('a')], cursor: 't1' });
    const result = mergeFirstPage(listing, page(['a', 'b', 'c'], [], 'fresh'));

    expect(keys(result).files).toEqual(['a', 'b', 'c']);
    expect(result.cursor).toBe('fresh');
  });

  it('keeps folders loaded beyond the fresh page too', () => {
    const listing = listingOf({ folders: [folder('a/'), folder('zz-archive/')], cursor: 't2' });
    const result = mergeFirstPage(listing, page([], ['a/', 'b/'], 'fresh'));

    expect(keys(result).folders).toEqual(['a/', 'b/', 'zz-archive/']);
  });

  it('replaces everything when the fresh page is the whole folder', () => {
    const listing = listingOf({ files: [file('a'), file('z')], cursor: 't2' });
    const result = mergeFirstPage(listing, page(['a']));

    expect(keys(result).files).toEqual(['a']);
    expect(result.complete).toBe(true);
  });
});

describe('the loaded range', () => {
  const listing = listingOf({
    files: [file('a'), file('m')],
    folders: [folder('q/')],
    cursor: 't',
  });

  it('ends at the greater of the last folder and the last file', () => {
    expect(loadedEnd(listing)).toBe('q/');
  });

  it('holds keys up to that end, and none past it', () => {
    expect(withinLoaded(listing, 'p.txt')).toBe(true);
    expect(withinLoaded(listing, 'z.txt')).toBe(false);
  });

  it('holds every key once the listing is complete', () => {
    expect(withinLoaded(listingOf({ files: [file('a')] }), 'z.txt')).toBe(true);
  });

  it('places a file in key order', () => {
    expect(keys(withFile(listing, file('b'))).files).toEqual(['a', 'b', 'm']);
  });

  it('leaves out a file that belongs to a page not read yet, unless restoring it', () => {
    expect(withFile(listing, file('z'))).toBe(listing);
    expect(keys(withFile(listing, file('z'), true)).files).toEqual(['a', 'm', 'z']);
  });
});

describe('keysToEvict', () => {
  const at = (lastUsed: number, entries = 1) => ({
    ...listingOf({ files: Array.from({ length: entries }, (_, i) => file(`k${lastUsed}-${i}`)) }),
    lastUsed,
  });

  it('evicts nothing within the caps', () => {
    expect(keysToEvict({ a: at(1), b: at(2) }, 'a', { listings: 2, entries: 10 })).toEqual([]);
  });

  it('evicts the least recently used past the folder cap', () => {
    expect(
      keysToEvict({ a: at(1), b: at(2), c: at(3) }, 'c', { listings: 2, entries: 10 })
    ).toEqual(['a']);
  });

  it('evicts until the entries fit, never the folder on screen', () => {
    const listings = { a: at(1, 6), b: at(2, 6), c: at(3, 6) };
    expect(keysToEvict(listings, 'a', { listings: 10, entries: 12 })).toEqual(['b']);
  });
});

describe('newestFirst', () => {
  it('orders a copy of the files newest first and leaves the listing alone', () => {
    const files = [file('old', 60), file('new', 1), file('mid', 30)];
    expect(newestFirst(files).map((f) => f.Key)).toEqual(['new', 'mid', 'old']);
    expect(files.map((f) => f.Key)).toEqual(['old', 'new', 'mid']);
  });
});
