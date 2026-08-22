/**
 * Ordering the file and folder lists by name.
 *
 * S3 hands listings back in UTF-8 binary order, which is *nearly* alphabetical
 * and not quite: every capital sorts before every lowercase, so `Budget.xlsx`
 * lands above `annual.pdf`. Nobody reads that as sorted. The listing also has no
 * notion that `file10` should follow `file2` rather than precede it.
 *
 * So both directions are sorted here rather than only the reversed one, using a
 * collator that folds case and reads digit runs as numbers - the order people
 * mean when they say alphabetical.
 */

export type SortDirection = 'asc' | 'desc';

/** Anything the drive lists. Files and folders both carry a display name. */
interface Named {
  name: string;
}

/**
 * Built once. `Intl.Collator` is expensive to construct and a folder of a
 * thousand objects would otherwise build one per comparison.
 *
 * `sensitivity: 'base'` folds case and accents, so `Report` and `report` tie
 * rather than one being banished below the whole lowercase alphabet. Ties keep
 * the order S3 gave them, because `Array.prototype.sort` is stable - two files
 * differing only in case stay put instead of swapping on every re-render.
 */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** A copy of `items`, ordered by name. Never sorts in place. */
export function sortByName<T extends Named>(items: readonly T[], direction: SortDirection): T[] {
  const sorted = [...items].sort((a, b) => collator.compare(a.name, b.name));

  return direction === 'asc' ? sorted : sorted.reverse();
}

/**
 * Whether a folder can honestly be sorted at all.
 *
 * Descending needs every page: the last object in the bucket could belong at
 * the top, and there is no way to know it exists without fetching it. Ascending
 * is safe on a partial listing because S3 pages in key order, so what has
 * arrived is already the beginning of the answer.
 */
export function canSortDescending(isTruncated: boolean | undefined): boolean {
  return isTruncated !== true;
}
