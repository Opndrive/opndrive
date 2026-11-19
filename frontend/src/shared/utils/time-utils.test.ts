/**
 * The formatters are made once now, and must say exactly what the per-call
 * `toLocaleString` did.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, formatTimeWithTooltip } from './time-utils';

afterEach(() => {
  vi.useRealTimers();
});

describe('dates in a listing', () => {
  it('writes an older date this year the way toLocaleDateString did', () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00') });
    const date = new Date('2026-03-04T08:09:10');

    expect(formatRelativeTime(date)).toBe(
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );
  });

  it('adds the year for another year', () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00') });
    const date = new Date('2024-12-31T23:59:59');

    expect(formatRelativeTime(date)).toBe(
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    );
  });

  it('gives the full timestamp in the tooltip, as before', () => {
    const date = new Date('2025-07-14T16:05:09');

    expect(formatTimeWithTooltip(date).tooltip).toBe(
      date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  });

  it('keeps the relative wording for recent dates', () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00') });

    expect(formatRelativeTime(new Date('2026-11-19T11:30:00'))).toBe('30 minutes ago');
    expect(formatRelativeTime(new Date('2026-11-18T11:00:00'))).toBe('Yesterday');
    expect(formatRelativeTime(undefined)).toBe('');
  });
});
