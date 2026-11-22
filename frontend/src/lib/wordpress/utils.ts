/**
 * WordPress utility functions
 */

import { decodeHtmlEntities } from './entities';

/**
 * Format a date string to a human-readable format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Format a date string to a relative time (e.g., "2 days ago")
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return 'Today';
  } else if (diffInDays === 1) {
    return 'Yesterday';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  }
}

/**
 * Strip HTML tags from a string
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Truncate text to a specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Get reading time estimate in minutes
 */
export function getReadingTime(content: string): number {
  const wordsPerMinute = 200;
  return Math.max(1, Math.ceil(countWords(content) / wordsPerMinute));
}

/**
 * Words in a post's HTML. Each tag counts as a space: removed outright, the
 * end of one block ran into the start of the next ("three.</p><p>Four" read
 * as one word), and entities are decoded so "&amp;" is not a word.
 */
export function countWords(html: string): number {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Generate excerpt from content if not provided
 */
export function generateExcerpt(content: string, maxLength = 160): string {
  const text = stripHtmlTags(content);
  return truncateText(text, maxLength);
}

/**
 * Whether a post changed on a later day than it was published, judged on the
 * site's own calendar (the `...Local` dates). A fix made the same day is part
 * of publishing it; telling readers it was "updated" then would say nothing.
 */
export function wasUpdatedAfterPublishing(publishedLocal: string, modifiedLocal: string): boolean {
  const day = (date: string) => (/^\d{4}-\d{2}-\d{2}/.exec(date) ?? [''])[0];
  const published = day(publishedLocal);
  const modified = day(modifiedLocal);
  return Boolean(published && modified) && modified > published;
}
