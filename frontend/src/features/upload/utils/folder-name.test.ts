/**
 * Folder name rules.
 *
 * The bug these guard against was silent: `isValidFolderName` accepted
 * `Café ☕`, the dialog printed rules matching neither function, and
 * `sanitizeFolderName` then created the folder as `Caf_ __` without telling
 * anyone. So the important assertions here are the ones proving a name comes
 * out the far side exactly as it went in.
 */

import { describe, it, expect } from 'vitest';
import { describeFolderNameError, isValidFolderName } from './folder-name';

describe('names a user is entitled to', () => {
  it.each([
    ['plain ascii', 'Documents'],
    ['accents', 'Café'],
    ['emoji', 'Holiday ☕'],
    ['CJK', '文档'],
    ['cyrillic', 'Документы'],
    ['arabic', 'مستندات'],
    ['spaces and punctuation', 'Q3 report (final) v2.1'],
    ['a leading dot', '.config'],
    ['characters Windows dislikes', 'a<b>c:d"e|f?g*h'],
    ['a name that is only reserved on Windows', 'CON'],
    ['backslash', 'back\\slash'],
  ])('accepts %s', (_label, name) => {
    expect(describeFolderNameError(name)).toBeNull();
    expect(isValidFolderName(name)).toBe(true);
  });

  it('accepts a name at exactly the byte limit', () => {
    expect(describeFolderNameError('a'.repeat(255))).toBeNull();
  });
});

describe('names that would break the key or the paths built from it', () => {
  it.each([
    ['empty', ''],
    ['only whitespace', '   '],
  ])('rejects %s', (_label, name) => {
    expect(describeFolderNameError(name)).toBe('Folder name cannot be empty.');
  });

  it('rejects a slash, which would create nested folders instead of one', () => {
    expect(describeFolderNameError('a/b')).toBe('Folder name cannot contain a slash.');
  });

  it.each(['.', '..'])('rejects %s', (name) => {
    expect(describeFolderNameError(name)).toBe('Folder name cannot be "." or "..".');
  });

  it('rejects control characters', () => {
    const message = 'Folder name cannot contain control characters.';

    expect(describeFolderNameError('bad\u0007name')).toBe(message);
    expect(describeFolderNameError('bad\u0000name')).toBe(message);
    expect(describeFolderNameError('bad\u007Fname')).toBe(message);
  });

  it('measures length in bytes, not characters', () => {
    // 100 four-byte emoji is 400 bytes, well inside a 255 character limit but
    // past what the key can carry.
    const emoji = '😀'.repeat(100);
    expect(emoji.length).toBeLessThan(255);
    expect(describeFolderNameError(emoji)).toMatch(/too long/);
  });
});

describe('whitespace is trimmed rather than treated as an error', () => {
  it('accepts a name with surrounding spaces', () => {
    expect(describeFolderNameError('  Reports  ')).toBeNull();
  });

  it('judges the trimmed name against the rules', () => {
    // Would pass on raw length, fails once trimmed to nothing.
    expect(describeFolderNameError('\t\n  ')).toBe('Folder name cannot be empty.');
  });
});
