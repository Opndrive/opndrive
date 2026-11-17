/**
 * Clearing out what an earlier version left in the browser.
 *
 * The multipart uploader used to write an entry to localStorage after every
 * part it sent, under `upload:<file name>:<object key>`, holding the file's
 * name, its key, its size and the id of the upload. It was meant to let an
 * upload resume, and nothing ever read it. It was not in the storage registry
 * either, because the registry's guard scans this app and the write lived in
 * the s3-api package - so the privacy policy listed everything we store except
 * the one thing that named your files.
 *
 * The write is gone. This is for the entries it already made. An upload that
 * finished or was cancelled removed its own, but one that failed, or was still
 * running when the tab closed, left it there with nothing that would ever come
 * back for it.
 *
 * It can be deleted once enough time has passed that nobody is carrying those
 * entries around any more. Nothing depends on it.
 */

/** What the uploader wrote under. Nothing writes this any more. */
export const LEGACY_UPLOAD_STATE_PREFIX = 'upload:';

/**
 * Removes every entry the old uploader left behind.
 *
 * @returns how many were removed, which is only of interest to a test.
 */
export function clearLegacyUploadState(): number {
  try {
    const stale: string[] = [];

    // Collected first, removed after. Removing while walking by index shifts
    // every later key down by one, so every second entry would be stepped over.
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (key?.startsWith(LEGACY_UPLOAD_STATE_PREFIX)) stale.push(key);
    }

    for (const key of stale) localStorage.removeItem(key);

    return stale.length;
  } catch {
    // Storage can be switched off, or refuse to be read at all. Then there is
    // nothing here we could have written to in the first place.
    return 0;
  }
}
