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

  // Same day, show time-based relative format
  if (diffInDays === 0) {
    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
  }

  // Yesterday
  if (diffInDays === 1) {
    return 'Yesterday';
  }

  // This week (2-6 days ago)
  if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  }

  // More than a week ago, show the actual date
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
