/**
 * Reading the files of a folder upload, for both upload managers'
 * `addFolderUpload`.
 */

/**
 * Whether an entry of a FileList stands for a folder rather than a file.
 *
 * A folder picker lists files only, each with its path inside the folder: an
 * empty `__init__.py` or `LICENSE` among them. A folder dropped onto a page
 * shows up in `dataTransfer.files` as an entry of its own, with no path, no
 * type and, on most systems, no bytes.
 *
 * Every zero-byte file with no type used to be taken for one, path or not,
 * which left a folder's empty files behind. A file with a path is now always
 * a file.
 *
 * Without a path, only an entry with no type and no bytes is skipped, as
 * before. One with bytes may be a real file, such as a `Makefile` among
 * dropped files, and skipping it would lose it without a word. A folder entry
 * of a few bytes, as macOS gives, is let through as it always was: it cannot
 * be read, so its upload fails where it can be seen, and stores nothing.
 */
export function isDroppedFolderEntry(file: File): boolean {
  return !file.webkitRelativePath && file.type === '' && file.size === 0;
}

/**
 * The key for one file of a folder upload: its path inside the folder, or its
 * name when it has none. Keyed by an empty path alone, every such file went to
 * the base prefix itself.
 */
export function folderUploadKey(file: File, basePrefix = ''): string {
  return `${basePrefix}${file.webkitRelativePath || file.name}`;
}
