/**
 * Reading the files of a folder upload, for both upload managers'
 * `addFolderUpload`.
 */

/**
 * Whether an entry of a FileList stands for a folder rather than a file.
 *
 * A folder picker lists files only, each with its path inside the folder: an
 * empty `__init__.py` or `LICENSE` among them. A folder dropped onto a page
 * shows up in `dataTransfer.files` as an entry of its own, with no path and
 * no type, and zero bytes or a few depending on the system. Only that has
 * nothing to upload, and uploaded it would write over the folder's own key.
 *
 * Every zero-byte file with no type used to be taken for one, which left a
 * folder's empty files behind and still let through a folder entry of a few
 * bytes.
 */
export function isDroppedFolderEntry(file: File): boolean {
  return !file.webkitRelativePath && file.type === '';
}

/**
 * The key for one file of a folder upload: its path inside the folder, or its
 * name when it has none. Keyed by an empty path alone, every such file went to
 * the base prefix itself.
 */
export function folderUploadKey(file: File, basePrefix = ''): string {
  return `${basePrefix}${file.webkitRelativePath || file.name}`;
}
