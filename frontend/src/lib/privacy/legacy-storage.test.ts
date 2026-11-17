/**
 * The cleanup for upload state an earlier version wrote and nothing read.
 *
 * Two ways to get this wrong, and they pull in opposite directions: leave some
 * of those entries behind, or remove something that is still in use. Both are
 * tested, and the second one against the real registry rather than a list
 * written out by hand.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_UPLOAD_STATE_PREFIX, clearLegacyUploadState } from './legacy-storage';
import { STORAGE_KEYS } from './storage-keys';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clearLegacyUploadState', () => {
  it('removes what the old uploader wrote', () => {
    localStorage.setItem('upload:holiday.mp4:videos/holiday.mp4', '{"uploadId":"abc"}');

    clearLegacyUploadState();

    expect(localStorage.getItem('upload:holiday.mp4:videos/holiday.mp4')).toBeNull();
  });

  it('removes every one of them, not every other one', () => {
    // Removing while walking by index skips the entry that slides into the
    // slot just vacated. Five in a row is enough to show it.
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      localStorage.setItem(`upload:${name}.bin:docs/${name}.bin`, '{}');
    }

    expect(clearLegacyUploadState()).toBe(5);
    expect(localStorage.length).toBe(0);
  });

  it('leaves everything else exactly where it was', () => {
    localStorage.setItem('s3_user_session', '{"bucketName":"mine"}');
    localStorage.setItem('ui-theme', 'dark');
    // The nearest miss there is: same word, a hyphen where the colon would be.
    localStorage.setItem('upload-settings-storage', '{"state":{"uploadMode":"multipart"}}');
    localStorage.setItem('upload:big.bin:docs/big.bin', '{}');

    expect(clearLegacyUploadState()).toBe(1);

    expect(localStorage.getItem('s3_user_session')).toBe('{"bucketName":"mine"}');
    expect(localStorage.getItem('ui-theme')).toBe('dark');
    expect(localStorage.getItem('upload-settings-storage')).toBe(
      '{"state":{"uploadMode":"multipart"}}'
    );
  });

  it('does nothing when there is nothing to remove', () => {
    localStorage.setItem('ui-theme', 'dark');

    expect(clearLegacyUploadState()).toBe(0);
    expect(localStorage.length).toBe(1);
  });

  it('gives up quietly when storage cannot be read', () => {
    // What a browser set to refuse site data does on first touch.
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    localStorage.setItem('upload:big.bin:docs/big.bin', '{}');

    // This runs on every page load. Throwing here would take the app down
    // over data nobody needs.
    expect(() => clearLegacyUploadState()).not.toThrow();
    expect(clearLegacyUploadState()).toBe(0);
  });
});

describe('the prefix it removes', () => {
  // The guard for the day somebody registers a key called `upload:something`.
  // Without it that key would be written, and then deleted on the next load,
  // and the feature behind it would look like it forgot things at random.
  it('is not the start of any key the app actually uses', () => {
    const swept = STORAGE_KEYS.filter((entry) => entry.key.startsWith(LEGACY_UPLOAD_STATE_PREFIX));

    expect(swept).toEqual([]);
  });
});
