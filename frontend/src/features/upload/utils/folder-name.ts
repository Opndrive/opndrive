/**
 * What a folder may be called.
 *
 * S3 object keys are UTF-8, so `Café ☕/` and `文档/` are perfectly good
 * prefixes. This module used to export a `sanitizeFolderName` that replaced
 * everything outside `[a-zA-Z0-9\-_.\s()]` with an underscore, so `Café ☕`
 * became `Caf_ __` and the folder was created under a name the user never
 * typed, with nothing on screen to say so.
 *
 * Creation was also the only path that did this. Renaming a folder and
 * uploading one both write the name through untouched, so buckets already hold
 * Unicode folder names; sanitizing made the three paths disagree with each
 * other and with the rules the dialog printed.
 *
 * So nothing is rewritten here any more. A name is either accepted and written
 * exactly as typed, or rejected with a reason the UI can show. The rules below
 * are deliberately short, covering only what genuinely breaks an S3 key or the
 * paths built from it - not what some other operating system dislikes.
 */

/**
 * Longest name accepted, in UTF-8 bytes rather than characters. S3 caps a whole
 * key at 1024 bytes, and one emoji costs four of them, so counting characters
 * would let a name through that the bucket then rejects.
 */
const MAX_NAME_BYTES = 255;

/**
 * C0 controls and DEL. Technically legal in a key, but AWS lists them as
 * needing special handling and they break URLs, breadcrumbs and anything that
 * displays the name.
 */
// eslint-disable-next-line no-control-regex -- matching them is the point
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Returns null when the name is usable, otherwise a message to show the user.
 *
 * Validates the trimmed name because that is what callers go on to create;
 * surrounding whitespace is dropped rather than treated as an error.
 */
export function describeFolderNameError(folderName: string): string | null {
  const name = folderName.trim();

  if (!name) {
    return 'Folder name cannot be empty.';
  }

  if (name === '.' || name === '..') {
    return 'Folder name cannot be "." or "..".';
  }

  if (name.includes('/')) {
    // A slash would silently create nested folders rather than one named folder.
    return 'Folder name cannot contain a slash.';
  }

  if (CONTROL_CHARACTERS.test(name)) {
    return 'Folder name cannot contain control characters.';
  }

  if (utf8ByteLength(name) > MAX_NAME_BYTES) {
    return `Folder name is too long. Keep it under ${MAX_NAME_BYTES} bytes.`;
  }

  return null;
}

/** Yes or no, for call sites that do not show the reason. */
export const isValidFolderName = (folderName: string): boolean =>
  describeFolderNameError(folderName) === null;
