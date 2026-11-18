import { describe, expect, it } from 'vitest';
import { gmtToIso } from './service';

describe('gmtToIso', () => {
  it('marks a zone-less WPGraphQL GMT time as UTC', () => {
    expect(gmtToIso('2026-11-01T03:30:00')).toBe('2026-11-01T03:30:00Z');
    expect(new Date(gmtToIso('2026-11-01T03:30:00')!).toISOString()).toBe(
      '2026-11-01T03:30:00.000Z'
    );
  });

  it('leaves a value that already names its zone alone', () => {
    expect(gmtToIso('2026-11-01T03:30:00Z')).toBe('2026-11-01T03:30:00Z');
    expect(gmtToIso('2026-11-01T03:30:00+00:00')).toBe('2026-11-01T03:30:00+00:00');
  });

  it('gives nothing for a missing value', () => {
    expect(gmtToIso(undefined)).toBeUndefined();
    expect(gmtToIso(null)).toBeUndefined();
    expect(gmtToIso('')).toBeUndefined();
  });
});
