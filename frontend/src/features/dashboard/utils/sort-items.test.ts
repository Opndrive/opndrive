/**
 * The ordering people mean by "alphabetical", which is not the one S3 gives.
 */

import { describe, expect, it } from 'vitest';
import { sortByName, canSortDescending } from './sort-items';

const named = (...names: string[]) => names.map((name) => ({ name }));
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe('sortByName', () => {
  it('orders ascending', () => {
    expect(names(sortByName(named('cherry', 'apple', 'banana'), 'asc'))).toEqual([
      'apple',
      'banana',
      'cherry',
    ]);
  });

  it('orders descending', () => {
    expect(names(sortByName(named('apple', 'cherry', 'banana'), 'desc'))).toEqual([
      'cherry',
      'banana',
      'apple',
    ]);
  });

  // The reason ascending is sorted at all rather than left as S3 returned it.
  // In UTF-8 binary order every capital precedes every lowercase, so the raw
  // listing puts Budget.xlsx above annual.pdf.
  it('folds case instead of banishing lowercase below every capital', () => {
    expect(names(sortByName(named('annual.pdf', 'Budget.xlsx', 'contract.doc'), 'asc'))).toEqual([
      'annual.pdf',
      'Budget.xlsx',
      'contract.doc',
    ]);
  });

  it('reads digit runs as numbers', () => {
    expect(names(sortByName(named('file10.txt', 'file2.txt', 'file1.txt'), 'asc'))).toEqual([
      'file1.txt',
      'file2.txt',
      'file10.txt',
    ]);
  });

  // Two names differing only in case tie under a case-folding collator. Sort is
  // stable, so they hold their position rather than swapping on each render.
  it('leaves tied names in the order they arrived', () => {
    const input = named('Report.pdf', 'report.pdf');

    expect(names(sortByName(input, 'asc'))).toEqual(['Report.pdf', 'report.pdf']);
  });

  it('does not disturb the array it was given', () => {
    const input = named('cherry', 'apple');
    sortByName(input, 'asc');

    expect(names(input)).toEqual(['cherry', 'apple']);
  });

  it('handles an empty list', () => {
    expect(sortByName([], 'asc')).toEqual([]);
  });
});

describe('canSortDescending', () => {
  // Descending needs the whole folder: the last object in the bucket could
  // belong at the top, and nothing in a partial listing reveals that.
  it('is refused while the folder is still truncated', () => {
    expect(canSortDescending(true)).toBe(false);
  });

  it('is allowed once the folder is complete', () => {
    expect(canSortDescending(false)).toBe(true);
  });

  // A folder that never reported truncation is small enough to have arrived
  // whole in one page.
  it('treats an unknown truncation as complete', () => {
    expect(canSortDescending(undefined)).toBe(true);
  });
});
