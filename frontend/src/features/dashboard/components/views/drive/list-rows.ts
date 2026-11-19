import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';
import { fileKey, folderKey } from '@/context/folder-listing';

/**
 * One row of the list view, in the order they are drawn.
 *
 * Folders come first, then files, each in the order S3 returned them. A folder
 * that arrives on a later page joins the folders, above every file, which is
 * why the list says so while the folder is still loading. The last row stands
 * for the pages not read yet: it shows them loading, or offers a retry.
 *
 * `index` is the row's place in folders-then-files, the array shift-select
 * slices, which is not its place in this list once a note sits between them.
 */
export type ListRow =
  | { kind: 'folder'; key: string; folder: Folder; index: number }
  | { kind: 'file'; key: string; file: FileItem; index: number }
  | { kind: 'folders-note'; key: string }
  | { kind: 'more'; key: string };

export function listRows(folders: Folder[], files: FileItem[], complete: boolean): ListRow[] {
  const rows: ListRow[] = [];

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]!;
    rows.push({ kind: 'folder', key: `d:${folderKey(folder)}`, folder, index: i });
  }

  if (!complete && folders.length > 0) rows.push({ kind: 'folders-note', key: 'folders-note' });

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    rows.push({ kind: 'file', key: `f:${fileKey(file)}`, file, index: folders.length + i });
  }

  if (!complete) rows.push({ kind: 'more', key: 'more' });

  return rows;
}

/**
 * Every row's height, fixed, so nothing is measured while scrolling.
 *
 * The item heights are what the rows already draw at: the table row's
 * `sm:min-h-[64px]`, and the card's 16px padding around 40px of text, plus its
 * 1px divider.
 */
export const ROW_HEIGHT = { desktop: 64, mobile: 73 } as const;
export const NOTE_HEIGHT = 40;
export const MORE_HEIGHT = 64;

export function rowHeight(row: ListRow, desktop: boolean): number {
  switch (row.kind) {
    case 'folder':
    case 'file':
      return desktop ? ROW_HEIGHT.desktop : ROW_HEIGHT.mobile;
    case 'folders-note':
      return NOTE_HEIGHT;
    case 'more':
      return MORE_HEIGHT;
  }
}
