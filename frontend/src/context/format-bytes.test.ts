/**
 * The size shown beside every file in the list.
 */

import { describe, expect, it } from 'vitest';
import { formatBytes } from './data-context';

describe('formatBytes', () => {
  it.each([
    [0, 'zero'],
    [undefined, 'a missing size'],
    [-5, 'a negative size'],
  ])('shows 0 B for %j (%s)', (bytes, _what) => {
    expect(formatBytes(bytes)).toEqual({ value: 0, unit: 'B' });
  });

  it('stays in bytes below a kilobyte', () => {
    expect(formatBytes(1023)).toEqual({ value: 1023, unit: 'B' });
  });

  it('turns exactly 1024 bytes into 1 KB', () => {
    expect(formatBytes(1024)).toEqual({ value: 1, unit: 'KB' });
  });

  it('keeps two decimals at most', () => {
    expect(formatBytes(1536)).toEqual({ value: 1.5, unit: 'KB' });
    expect(formatBytes(1024 * 1024 * 1.23456)).toEqual({ value: 1.23, unit: 'MB' });
  });

  it.each([
    [1024 ** 2, 'MB'],
    [1024 ** 3, 'GB'],
    [1024 ** 4, 'TB'],
  ])('reads %i bytes as 1 %s', (bytes, unit) => {
    expect(formatBytes(bytes)).toEqual({ value: 1, unit });
  });

  it('stops at TB rather than inventing a larger unit', () => {
    expect(formatBytes(1024 ** 5)).toEqual({ value: 1024, unit: 'TB' });
  });
});
