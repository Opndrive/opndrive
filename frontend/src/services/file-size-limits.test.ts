/**
 * Preview eligibility and size formatting.
 *
 * Pure functions over the extension config, so nothing is mocked. The limits
 * come from PREVIEW_SIZE_LIMITS and are referenced rather than hardcoded, so
 * retuning a limit does not require editing assertions here - only a change to
 * which category a file falls into would.
 */

import { describe, it, expect } from 'vitest';
import {
  checkPreviewEligibility,
  formatFileSize,
  getSizeLimitForCategory,
  isFileSizeAllowedForPreview,
} from './file-size-limits';
import { PREVIEW_SIZE_LIMITS } from '@/config/file-extensions';

const MB = 1024 * 1024;

describe('checkPreviewEligibility', () => {
  it('allows a file inside its limit', () => {
    const result = checkPreviewEligibility('photo.png', 1 * MB);

    expect(result).toEqual({
      canPreview: true,
      sizeLimit: PREVIEW_SIZE_LIMITS.image,
      actualSize: 1 * MB,
    });
  });

  it('allows a file exactly at the limit', () => {
    // The check is `>` so the boundary itself is still previewable.
    const result = checkPreviewEligibility('photo.png', PREVIEW_SIZE_LIMITS.image);

    expect(result.canPreview).toBe(true);
  });

  it('rejects a file one byte over the limit', () => {
    const result = checkPreviewEligibility('photo.png', PREVIEW_SIZE_LIMITS.image + 1);

    expect(result.canPreview).toBe(false);
    expect(result.reason).toMatch(/exceeds \d+MB limit/);
    expect(result.sizeLimit).toBe(PREVIEW_SIZE_LIMITS.image);
  });

  it('reports the limit in MB in the message', () => {
    const result = checkPreviewEligibility('sheet.xlsx', PREVIEW_SIZE_LIMITS.spreadsheet + 1);

    expect(result.reason).toBe('File size exceeds 10MB limit');
  });

  it('rejects an unrecognised extension', () => {
    const result = checkPreviewEligibility('mystery.qqq', 10);

    expect(result).toEqual({
      canPreview: false,
      reason: 'File type not supported for preview',
      sizeLimit: 0,
      actualSize: 10,
    });
  });

  it('treats a file with no extension as a document', () => {
    const result = checkPreviewEligibility('noextension', 10);

    // The config falls back to 'document' rather than refusing, so plain
    // extensionless files (LICENSE, CHANGELOG) still preview as text.
    expect(result.canPreview).toBe(true);
    expect(result.sizeLimit).toBe(PREVIEW_SIZE_LIMITS.document);
  });

  it('rejects a category that has no preview support', () => {
    // Archives have a limit of 0, meaning "never preview" rather than "no cap".
    const result = checkPreviewEligibility('bundle.zip', 1);

    expect(result.canPreview).toBe(false);
    expect(result.sizeLimit).toBe(0);
  });

  it('allows a zero-byte file of a previewable type', () => {
    const result = checkPreviewEligibility('empty.png', 0);

    expect(result.canPreview).toBe(true);
  });

  it('always reports the size it was given', () => {
    expect(checkPreviewEligibility('mystery.qqq', 1234).actualSize).toBe(1234);
    expect(checkPreviewEligibility('photo.png', 1234).actualSize).toBe(1234);
  });

  it.each([
    ['photo.PNG', true],
    ['REPORT.PDF', true],
    ['ARCHIVE.ZIP', false],
  ])('is case-insensitive about the extension (%s)', (name, expected) => {
    expect(checkPreviewEligibility(name, 1024).canPreview).toBe(expected);
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
  ])('renders %i bytes as %s', (bytes, expected) => {
    // Bytes get no decimal place; anything larger gets one.
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it.each([
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [1024 * 1024 * 1024, '1.0 GB'],
    [1024 ** 4, '1.0 TB'],
  ])('renders %i bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it('stops at terabytes rather than inventing a larger unit', () => {
    expect(formatFileSize(1024 ** 5)).toBe('1024.0 TB');
  });

  it('steps up exactly at the 1024 boundary', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });
});

describe('getSizeLimitForCategory', () => {
  it.each([
    'image',
    'video',
    'document',
    'spreadsheet',
    'presentation',
    'audio',
    'code',
    'archive',
    'executable',
  ] as const)('KNOWN BUG: returns 0 for %s, the same as every other category', (category) => {
    // It looks the category up as if it were a file extension
    // (`getPreviewSizeLimit('.image')`), and no category name is a real
    // extension - so this returns 0 for everything, including types that do
    // have a limit.
    //
    // Nothing imports it today, which is why the breakage went unnoticed.
    // Pinned rather than fixed: reading PREVIEW_SIZE_LIMITS[category] directly
    // would make this fail, which is the prompt to decide whether the function
    // should exist at all.
    expect(getSizeLimitForCategory(category)).toBe(0);
  });

  it('disagrees with the limit the eligibility check actually applies', () => {
    expect(checkPreviewEligibility('photo.png', 1).sizeLimit).toBe(PREVIEW_SIZE_LIMITS.image);
    expect(getSizeLimitForCategory('image')).toBe(0);
  });
});

describe('isFileSizeAllowedForPreview (legacy shape)', () => {
  it('reports an allowed file with formatted sizes', () => {
    const result = isFileSizeAllowedForPreview('photo.png', 2 * MB);

    expect(result).toEqual({
      allowed: true,
      reason: undefined,
      limit: formatFileSize(PREVIEW_SIZE_LIMITS.image),
      currentSize: '2.0 MB',
    });
  });

  it('reports an oversized file with its reason', () => {
    const result = isFileSizeAllowedForPreview('photo.png', PREVIEW_SIZE_LIMITS.image + 1);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/exceeds/);
    expect(result.limit).toBe(formatFileSize(PREVIEW_SIZE_LIMITS.image));
  });

  it('omits the limit when there is none to show', () => {
    const result = isFileSizeAllowedForPreview('mystery.qqq', 100);

    // A limit of "0 B" would read as though previews were configured off for
    // this type, rather than the type being unknown.
    expect(result.limit).toBeUndefined();
    expect(result.currentSize).toBe('100 B');
  });
});
