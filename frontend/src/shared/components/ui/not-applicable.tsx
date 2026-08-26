/**
 * The dash a cell shows when the value does not exist for this kind of row.
 *
 * Not "we could not load it" and not "it is zero". A folder has no size the way
 * a file does, and a folder has no date at all, so the cell is answering a
 * question that does not apply rather than failing to answer one that does.
 *
 * It exists as a component because the two cells that needed it drifted apart
 * immediately: the size cell rendered a bare `&mdash;` whose reasoning lived
 * only in a code comment, and the date cell rendered a dash that explained
 * itself on hover. Same character, same meaning, two behaviours, and any third
 * column would have invented a fourth. The reason is picked from `BECAUSE`
 * below, so a caller cannot ship a dash with no explanation or invent its own
 * wording for one already written.
 *
 * Deliberately not built on `AriaLabel`, which is what the rest of the app uses
 * for tooltips. That component carries four pieces of state, five refs, three
 * effects and a portal - reasonable for a button, and there are two of these
 * per folder row, so a directory of a hundred folders would mount two hundred
 * of them. This renders two spans and no hooks. `title` is the browser's own
 * tooltip and costs nothing.
 *
 * The dash is hidden from screen readers and the reason is read in its place: a
 * lone em dash is announced as punctuation or skipped entirely, and `title` is
 * not reliably announced. Neither span is focusable, because a table of this
 * would otherwise put two tab stops in every row and make the grid slower to
 * cross by keyboard than it is to read.
 */

interface NotApplicableProps {
  /** Why the value is absent. Pick one from `BECAUSE`. */
  reason: string;
  className?: string;
}

/**
 * The reasons a cell has nothing to show, written once each.
 *
 * Phrased as statements about the storage rather than about our request,
 * because that is what they are: neither of these is a fetch that failed or a
 * value we could go and get later.
 */
export const BECAUSE = {
  /**
   * Totalling the objects underneath would cost a LIST per row, which is the
   * same reason the listing itself does not carry one.
   */
  folderHasNoSize: 'Folders have no size of their own, and S3 does not report one.',
  /**
   * A delimited listing returns folders as CommonPrefixes, which hold the
   * prefix string and no metadata whatsoever. There is no creation date to
   * fall back on either: objects carry LastModified and nothing else.
   */
  listingHasNoDate: 'This listing carries no date for it.',
} as const;

export function NotApplicable({ reason, className }: NotApplicableProps) {
  return (
    <span className={className} title={reason}>
      <span aria-hidden="true">&mdash;</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}
