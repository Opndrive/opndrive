import { describe, it, expect } from 'vitest';
import { listRows, rowHeight } from './list-rows';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

const folder = (prefix: string) => ({ id: prefix, name: prefix, Prefix: prefix }) as Folder;
const file = (key: string) => ({ id: key, name: key, Key: key }) as FileItem;

describe('the list view rows', () => {
  it('puts folders before files, each in the order given', () => {
    const rows = listRows([folder('b/'), folder('a/')], [file('z'), file('y')], true);

    expect(rows.map((row) => row.key)).toEqual(['d:b/', 'd:a/', 'f:z', 'f:y']);
  });

  it('numbers items by their place in folders-then-files, which shift-select slices', () => {
    const rows = listRows([folder('a/')], [file('x'), file('y')], false);

    const indexes = rows.flatMap((row) => ('index' in row ? [row.index] : []));
    expect(indexes).toEqual([0, 1, 2]);
  });

  it('adds the note and the loading row only while pages are left', () => {
    expect(listRows([folder('a/')], [file('x')], false).map((row) => row.kind)).toEqual([
      'folder',
      'folders-note',
      'file',
      'more',
    ]);
    expect(listRows([folder('a/')], [file('x')], true).map((row) => row.kind)).toEqual([
      'folder',
      'file',
    ]);
  });

  it('has no note when no folder has turned up', () => {
    expect(listRows([], [file('x')], false).map((row) => row.kind)).toEqual(['file', 'more']);
  });

  it('gives items the height each layout draws them at', () => {
    const [row] = listRows([], [file('x')], true);

    expect(rowHeight(row!, true)).toBe(64);
    expect(rowHeight(row!, false)).toBe(73);
  });
});
