/**
 * One formatter per shape, made once.
 *
 * `toLocaleString` with options builds a fresh `Intl.DateTimeFormat` on every
 * call, and every row in a listing formats two dates. Scrolling a long list
 * mounts a screenful of rows at a time, and building sixty formatters was a
 * visible share of each frame. The output is the same: `toLocaleString(locale,
 * options)` is defined as formatting with exactly this formatter.
 */
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const FULL_TIMESTAMP = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

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

  return isCurrentYear ? SHORT_DATE.format(date) : SHORT_DATE_WITH_YEAR.format(date);
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
  const tooltip = FULL_TIMESTAMP.format(date);

  return { display, tooltip };
}
