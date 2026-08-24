/**
 * Formats a date to relative time (e.g., "5 minutes ago", "2 hours ago", "yesterday")
 * @param date - The date to format
 * @returns Formatted relative time string
 */
export function formatRelativeTime(date: Date | undefined): string {
  if (!date) return '';

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
  }

  if (diffInDays === 1) {
    return 'Yesterday';
  }

  if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  }

  const isCurrentYear = date.getFullYear() === now.getFullYear();

  if (isCurrentYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}

/**
 * Formats a date with a tooltip showing the full timestamp
 * @param date - The date to format
 * @returns Object with display text and tooltip text
 */
export function formatTimeWithTooltip(date: Date | undefined): {
  display: string;
  tooltip: string;
} {
  if (!date) return { display: '', tooltip: '' };

  const display = formatRelativeTime(date);
  const tooltip = date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return { display, tooltip };
}

/**
 * What a row shows in a date column when the listing carries no date.
 *
 * S3 has no creation date to fall back on - objects carry `LastModified` and
 * nothing else - and folders are not objects at all. A delimited listing
 * returns them as `CommonPrefixes`, which hold the prefix string and no
 * metadata whatsoever, so there is nothing to read even where a folder marker
 * object exists in the bucket. This is permanent, not a gap to fill in later.
 *
 * `formatTimeWithTooltip` returns an empty string for a missing date, which
 * left the decision to each caller: the table row drew a blank cell, the mobile
 * row printed the words "No date", and the grid card dropped the line. Three
 * answers to one question.
 *
 * The rule is now the alignment: print a dash where there is a column to keep
 * it in, matching what the size cell already does for folders, and omit the
 * line entirely where there is not. A blank cell in a table reads as a load
 * that failed, which is why the tooltip says otherwise.
 */
export const NO_DATE = '—';

export const NO_DATE_TOOLTIP = 'The listing carries no date for this item.';
