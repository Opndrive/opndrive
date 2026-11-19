/**
 * Picking a free name for a file that would otherwise collide.
 *
 * This is what "keep both" runs on, so the one thing it must never do is hand
 * back a name that is in use. It used to: every check was wrapped in a catch
 * that answered "free", so a lookup the bucket refused returned the original
 * name untouched, and keeping both overwrote the file that was meant to stay.
 */

import { describe, it, expect, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { generateUniqueFileName } from './unique-filename';

/** A bucket holding exactly `taken`, as far as existence checks can tell. */
function bucketHolding(...taken: string[]) {
  const held = new Set(taken);
  const objectExists = vi.fn(async (key: string) => held.has(key));

  return {
    api: { objectExists } as unknown as BYOS3ApiProvider,
    objectExists,
  };
}

function bucketThatCannotBeChecked(error: Error) {
  return {
    objectExists: vi.fn(async () => {
      throw error;
    }),
  } as unknown as BYOS3ApiProvider;
}

describe('generateUniqueFileName', () => {
  it('keeps the original name when nothing is using it', async () => {
    const { api } = bucketHolding();

    await expect(generateUniqueFileName(api, 'notes.txt', 'docs/')).resolves.toBe('notes.txt');
  });

  it('looks under the folder the upload is headed for', async () => {
    const { api, objectExists } = bucketHolding();

    await generateUniqueFileName(api, 'notes.txt', 'docs/');

    expect(objectExists).toHaveBeenCalledExactlyOnceWith('docs/notes.txt');
  });

  it('numbers the name before its extension', async () => {
    const { api } = bucketHolding('docs/notes.txt');

    await expect(generateUniqueFileName(api, 'notes.txt', 'docs/')).resolves.toBe('notes (1).txt');
  });

  it('walks past every number already taken', async () => {
    const { api } = bucketHolding('notes.txt', 'notes (1).txt', 'notes (2).txt');

    await expect(generateUniqueFileName(api, 'notes.txt', '')).resolves.toBe('notes (3).txt');
  });

  it('numbers a name with no extension at the end', async () => {
    const { api } = bucketHolding('README');

    await expect(generateUniqueFileName(api, 'README', '')).resolves.toBe('README (1)');
  });

  it('treats a dotfile as all name, not an empty name with an extension', async () => {
    // ".gitignore" split at its dot would number the empty part: " (1).gitignore".
    const { api } = bucketHolding('.gitignore');

    await expect(generateUniqueFileName(api, '.gitignore', '')).resolves.toBe('.gitignore (1)');
  });

  it('numbers a name that already carries a number, as a copy of that name', async () => {
    // A copy of "report (1).pdf" is "report (1) (1).pdf". Reading the "(1)"
    // as our own counter and moving to "(2)" would name it after a different
    // file, which may well exist and mean something else.
    const { api } = bucketHolding('report (1).pdf');

    await expect(generateUniqueFileName(api, 'report (1).pdf', '')).resolves.toBe(
      'report (1) (1).pdf'
    );
  });

  it('numbers only the last extension of a name with several dots', async () => {
    const { api } = bucketHolding('backup.2024.zip');

    await expect(generateUniqueFileName(api, 'backup.2024.zip', '')).resolves.toBe(
      'backup.2024 (1).zip'
    );
  });

  it('throws when the original name could not be checked', async () => {
    const api = bucketThatCannotBeChecked(new Error('AccessDenied'));

    // Resolving with 'notes.txt' here is the bug: the name was never found to
    // be free, and the upload that follows writes straight over it.
    await expect(generateUniqueFileName(api, 'notes.txt', 'docs/')).rejects.toThrow('AccessDenied');
  });

  it('throws when a numbered candidate could not be checked', async () => {
    const objectExists = vi
      .fn<(key: string) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const api = { objectExists } as unknown as BYOS3ApiProvider;

    // The first answer was a real one, so the connection went away partway
    // through. "notes (1).txt" has not been shown to be free either.
    await expect(generateUniqueFileName(api, 'notes.txt', 'docs/')).rejects.toThrow(
      'Failed to fetch'
    );
  });
});
