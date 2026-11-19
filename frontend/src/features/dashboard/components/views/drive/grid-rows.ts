import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';
import { fileKey, folderKey } from '@/context/folder-listing';

/**
 * The grid view as rows of cards, in the order they are drawn.
 *
 * Two sections, each under its heading: folder cards, then file cards, each in
 * S3's order and cut into rows as wide as the container allows. Like the list,
 * a note sits under the folders while a later page may still add to them, and
 * the last row stands for the pages not read yet.
 *
 * `start` is the place of a row's first card in folders-then-files, the array
 * shift-select slices and keyboard focus moves through.
 */
export type GridRow =
  | { kind: 'heading'; key: string; section: Section }
  | { kind: 'folders'; key: string; items: Folder[]; start: number }
  | { kind: 'files'; key: string; items: FileItem[]; start: number }
  | { kind: 'folders-note'; key: string }
  | { kind: 'more'; key: string };

export type Section = 'folders' | 'files';

export interface GridLayout {
  rows: GridRow[];
  /** The row a card is drawn in, by its place in folders-then-files. */
  rowOf: (itemIndex: number) => number;
}

/** The narrowest a card gets before the grid drops a column. */
export const MIN_CARD_WIDTH = 220;
export const GRID_GAP = 16;
const MAX_COLUMNS = 6;

/** As many columns as fit cards at least `MIN_CARD_WIDTH` wide. */
export function columnsFor(width: number): number {
  const fit = Math.floor((width + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP));
  return Math.max(1, Math.min(MAX_COLUMNS, fit));
}

export function gridRows(
  folders: Folder[],
  files: FileItem[],
  complete: boolean,
  columns: number,
  collapsed: Readonly<Record<Section, boolean>>
): GridLayout {
  const rows: GridRow[] = [];
  let firstFolderRow = -1;
  let firstFileRow = -1;

  if (folders.length > 0) {
    rows.push({ kind: 'heading', key: 'h:folders', section: 'folders' });
    if (!collapsed.folders) {
      firstFolderRow = rows.length;
      for (let i = 0; i < folders.length; i += columns) {
        const items = folders.slice(i, i + columns);
        rows.push({ kind: 'folders', key: `d:${folderKey(items[0]!)}`, items, start: i });
      }
    }
    if (!complete) rows.push({ kind: 'folders-note', key: 'folders-note' });
  }

  if (files.length > 0) {
    rows.push({ kind: 'heading', key: 'h:files', section: 'files' });
    if (!collapsed.files) {
      firstFileRow = rows.length;
      for (let i = 0; i < files.length; i += columns) {
        const items = files.slice(i, i + columns);
        rows.push({
          kind: 'files',
          key: `f:${fileKey(items[0]!)}`,
          items,
          start: folders.length + i,
        });
      }
    }
  }

  if (!complete) rows.push({ kind: 'more', key: 'more' });

  const rowOf = (itemIndex: number) => {
    if (itemIndex < folders.length) {
      return firstFolderRow < 0 ? -1 : firstFolderRow + Math.floor(itemIndex / columns);
    }
    return firstFileRow < 0
      ? -1
      : firstFileRow + Math.floor((itemIndex - folders.length) / columns);
  };

  return { rows, rowOf };
}

/**
 * Where an arrow key moves focus from the card at `index`, or null to stay.
 *
 * Left and right step through folders-then-files in reading order. Up and down
 * keep the column: below a shorter last row they land on its last card, and
 * from the last row of folders they carry on into the files, so the two
 * sections behave as one grid. A collapsed section is stepped over.
 */
export function moveFocus(
  index: number,
  key: string,
  folders: number,
  files: number,
  columns: number,
  collapsed: Readonly<Record<Section, boolean>>
): number | null {
  const firstVisible = collapsed.folders || folders === 0 ? folders : 0;
  const lastVisible = collapsed.files || files === 0 ? folders - 1 : folders + files - 1;
  if (lastVisible < firstVisible) return null;

  const inFolders = index < folders;
  const base = inFolders ? 0 : folders;
  const length = inFolders ? folders : files;
  const local = index - base;
  const column = local % columns;
  const lastRowStart = Math.floor((length - 1) / columns) * columns;

  let target: number;
  switch (key) {
    case 'ArrowRight':
      target = index + 1;
      break;
    case 'ArrowLeft':
      target = index - 1;
      break;
    case 'Home':
      target = firstVisible;
      break;
    case 'End':
      target = lastVisible;
      break;
    case 'ArrowDown':
      if (local + columns < length) target = index + columns;
      else if (local < lastRowStart) target = base + length - 1;
      else if (inFolders && files > 0) target = folders + Math.min(column, files - 1);
      else return null;
      break;
    case 'ArrowUp':
      if (local >= columns) target = index - columns;
      else if (!inFolders && folders > 0) {
        const folderLastRow = Math.floor((folders - 1) / columns) * columns;
        target = Math.min(folderLastRow + column, folders - 1);
      } else return null;
      break;
    default:
      return null;
  }

  if (target < firstVisible || target > lastVisible || target === index) return null;
  return target;
}
