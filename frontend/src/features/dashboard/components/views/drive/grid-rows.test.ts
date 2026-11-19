import { describe, it, expect } from 'vitest';
import { columnsFor, gridRows, moveFocus } from './grid-rows';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

const folder = (prefix: string) => ({ id: prefix, name: prefix, Prefix: prefix }) as Folder;
const file = (key: string) => ({ id: key, name: key, Key: key }) as FileItem;
const folders = (n: number) => Array.from({ length: n }, (_, i) => folder(`d${i}/`));
const files = (n: number) => Array.from({ length: n }, (_, i) => file(`f${i}`));
const OPEN = { folders: false, files: false };

describe('columns from the container width', () => {
  it('fits as many 220px cards as the width allows, between one and six', () => {
    expect(columnsFor(0)).toBe(1);
    expect(columnsFor(375)).toBe(1);
    expect(columnsFor(616)).toBe(2);
    expect(columnsFor(720)).toBe(3);
    expect(columnsFor(1000)).toBe(4);
    expect(columnsFor(5000)).toBe(6);
  });
});

describe('the grid as rows', () => {
  it('heads each section and cuts its cards into rows', () => {
    const { rows } = gridRows(folders(5), files(3), true, 4, OPEN);

    expect(rows.map((row) => row.kind)).toEqual([
      'heading',
      'folders',
      'folders',
      'heading',
      'files',
    ]);
    expect(rows.map((row) => ('items' in row ? row.items.length : 0))).toEqual([0, 4, 1, 0, 3]);
  });

  it('numbers cards by their place in folders-then-files', () => {
    const { rows } = gridRows(folders(5), files(6), true, 4, OPEN);

    expect(rows.flatMap((row) => ('start' in row ? [row.start] : []))).toEqual([0, 4, 5, 9]);
  });

  it('adds the note and the loading row only while pages are left', () => {
    expect(gridRows(folders(1), files(1), false, 4, OPEN).rows.map((row) => row.kind)).toEqual([
      'heading',
      'folders',
      'folders-note',
      'heading',
      'files',
      'more',
    ]);
  });

  it('keeps a folded section to its heading', () => {
    const { rows, rowOf } = gridRows(folders(5), files(3), true, 4, {
      folders: true,
      files: false,
    });

    expect(rows.map((row) => row.kind)).toEqual(['heading', 'heading', 'files']);
    expect(rowOf(0)).toBe(-1);
    expect(rowOf(5)).toBe(2);
  });

  it('finds the row a card is drawn in', () => {
    const { rowOf } = gridRows(folders(5), files(9), true, 4, OPEN);

    expect(rowOf(0)).toBe(1);
    expect(rowOf(4)).toBe(2);
    expect(rowOf(5)).toBe(4);
    expect(rowOf(13)).toBe(6);
  });

  it('keys file rows by their first file, so rows above can change around them', () => {
    const before = gridRows(folders(4), files(8), false, 4, OPEN).rows;
    const after = gridRows(folders(5), files(8), false, 4, OPEN).rows;

    const fileKeys = (rows: typeof before) =>
      rows.filter((row) => row.kind === 'files').map((row) => row.key);
    expect(fileKeys(after)).toEqual(fileKeys(before));
  });
});

describe('arrow keys between cards', () => {
  // Five folders over two rows, then nine files over three, four to a row.
  const move = (from: number, key: string, collapsed = OPEN) =>
    moveFocus(from, key, 5, 9, 4, collapsed);

  it('steps left and right in reading order, across the sections', () => {
    expect(move(0, 'ArrowRight')).toBe(1);
    expect(move(4, 'ArrowRight')).toBe(5);
    expect(move(5, 'ArrowLeft')).toBe(4);
    expect(move(0, 'ArrowLeft')).toBeNull();
    expect(move(13, 'ArrowRight')).toBeNull();
  });

  it('keeps the column going up and down', () => {
    // Files are 5-8, 9-12 and 13.
    expect(move(6, 'ArrowDown')).toBe(10);
    expect(move(10, 'ArrowUp')).toBe(6);
  });

  it('lands on the last card when the row below is shorter', () => {
    // Folder 2 sits above the gap after folder 4, the lone card of row two.
    expect(move(2, 'ArrowDown')).toBe(4);
  });

  it('carries on from the last row of folders into the files, same column', () => {
    expect(move(4, 'ArrowDown')).toBe(5);
    expect(moveFocus(7, 'ArrowDown', 8, 9, 4, OPEN)).toBe(11);
  });

  it('goes back up from the first row of files into the folders, same column', () => {
    expect(move(5, 'ArrowUp')).toBe(4);
    expect(moveFocus(10, 'ArrowUp', 8, 9, 4, OPEN)).toBe(6);
    expect(move(9, 'ArrowUp')).toBe(5);
  });

  it('jumps to the first and last card with Home and End', () => {
    expect(move(7, 'Home')).toBe(0);
    expect(move(2, 'End')).toBe(13);
  });

  it('steps over a folded section', () => {
    const foldersFolded = { folders: true, files: false };

    expect(move(5, 'ArrowLeft', foldersFolded)).toBeNull();
    expect(move(5, 'ArrowUp', foldersFolded)).toBeNull();
    expect(move(9, 'Home', foldersFolded)).toBe(5);
  });

  it('ignores every other key', () => {
    expect(move(3, 'Enter')).toBeNull();
    expect(move(3, 'a')).toBeNull();
  });
});
