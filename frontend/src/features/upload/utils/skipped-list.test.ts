import { describe, expect, it } from 'vitest';
import { groupByFolder, skippedListText } from './skipped-list';

describe('groupByFolder', () => {
  it('lists each folder once, in path order, with what was skipped in it', () => {
    expect(
      groupByFolder([
        { path: 'photos/raw/b.cr2', kind: 'file' },
        { path: 'docs/a.pdf', kind: 'file' },
        { path: 'photos/raw/c.cr2', kind: 'file' },
        { path: 'top.txt', kind: 'file' },
      ])
    ).toEqual([
      { folder: '', names: ['top.txt'] },
      { folder: 'docs/', names: ['a.pdf'] },
      { folder: 'photos/raw/', names: ['b.cr2', 'c.cr2'] },
    ]);
  });

  it('marks a skipped folder with a trailing slash, under the folder holding it', () => {
    expect(groupByFolder([{ path: 'photos/locked', kind: 'folder' }])).toEqual([
      { folder: 'photos/', names: ['locked/'] },
    ]);
  });
});

describe('skippedListText', () => {
  it('is one path a line, folders ending in a slash', () => {
    expect(
      skippedListText(
        [
          { path: 'a/1.txt', kind: 'file' },
          { path: 'a/locked', kind: 'folder' },
        ],
        2
      )
    ).toBe('a/1.txt\na/locked/');
  });

  it('says how many it left out when the notice kept only some', () => {
    expect(skippedListText([{ path: 'a/1.txt', kind: 'file' }], 5)).toBe(
      'a/1.txt\n... and 4 more not listed'
    );
  });
});
