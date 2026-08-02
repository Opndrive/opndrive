/**
 * Multi-select store: the click/ctrl/shift selection state machine.
 *
 * Almost all the behaviour lives in one `selectItem` call whose meaning changes
 * with the modifier keys, so the cases below are grouped by modifier rather
 * than by action name.
 *
 * Identity is by S3 key: files carry `Key`, folders carry `Prefix`. Two
 * different objects describing the same key are the same selection.
 */

import { describe, it, expect } from 'vitest';
import { useMultiSelectStore } from './use-multi-select-store';
import type { FileItem } from '../types/file';
import type { Folder } from '../types/folder';

const store = () => useMultiSelectStore.getState();

const file = (key: string) => ({ Key: key, name: key }) as FileItem;
const folder = (prefix: string) => ({ Prefix: prefix, name: prefix }) as Folder;

/** Five files, so range selections have room to move in both directions. */
const files = [file('a.txt'), file('b.txt'), file('c.txt'), file('d.txt'), file('e.txt')];

/** Mirrors the store's own getItemKey: files carry Key, folders carry Prefix. */
const keysOf = () =>
  store().selectedItems.map((item) => {
    const record = item as unknown as { Key?: string; Prefix?: string };
    return record.Key ?? record.Prefix ?? '';
  });

describe('plain click', () => {
  it('selects exactly one item', () => {
    store().selectItem(files[1]!, 'file', 1, false, false, files);

    expect(keysOf()).toEqual(['b.txt']);
    expect(store().selectedType).toBe('file');
    expect(store().lastSelectedIndex).toBe(1);
  });

  it('replaces an existing selection', () => {
    store().selectItem(files[0]!, 'file', 0, true, false, files);
    store().selectItem(files[1]!, 'file', 1, true, false, files);

    store().selectItem(files[3]!, 'file', 3, false, false, files);

    expect(keysOf()).toEqual(['d.txt']);
  });
});

describe('ctrl+click', () => {
  it('adds to the selection', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);
    store().selectItem(files[2]!, 'file', 2, true, false, files);

    expect(keysOf()).toEqual(['a.txt', 'c.txt']);
  });

  it('removes an item that is already selected', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);
    store().selectItem(files[1]!, 'file', 1, true, false, files);

    store().selectItem(files[0]!, 'file', 0, true, false, files);

    expect(keysOf()).toEqual(['b.txt']);
  });

  it('matches by key, not by object identity', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);

    // A re-render hands the UI a fresh object for the same S3 key.
    store().selectItem(file('a.txt'), 'file', 0, true, false, files);

    expect(keysOf()).toEqual([]);
  });

  it('drops the type once the last item is deselected', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);

    store().selectItem(files[0]!, 'file', 0, true, false, files);

    // A lingering type would keep blocking folder selection.
    expect(store().selectedItems).toEqual([]);
    expect(store().selectedType).toBeNull();
  });

  it('keeps the type while anything is still selected', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);
    store().selectItem(files[1]!, 'file', 1, true, false, files);

    store().selectItem(files[0]!, 'file', 0, true, false, files);

    expect(store().selectedType).toBe('file');
  });

  it('starts a selection from nothing', () => {
    store().selectItem(files[2]!, 'file', 2, true, false, files);

    expect(keysOf()).toEqual(['c.txt']);
    expect(store().selectedType).toBe('file');
  });
});

describe('shift+click range', () => {
  it('selects downwards from the anchor', () => {
    store().selectItem(files[1]!, 'file', 1, false, false, files);

    store().selectItem(files[3]!, 'file', 3, false, true, files);

    expect(keysOf()).toEqual(['b.txt', 'c.txt', 'd.txt']);
  });

  it('selects upwards from the anchor', () => {
    store().selectItem(files[3]!, 'file', 3, false, false, files);

    store().selectItem(files[1]!, 'file', 1, false, true, files);

    // Range is min..max, so direction does not matter.
    expect(keysOf()).toEqual(['b.txt', 'c.txt', 'd.txt']);
  });

  it('selects a single item when the range collapses', () => {
    store().selectItem(files[2]!, 'file', 2, false, false, files);

    store().selectItem(files[2]!, 'file', 2, false, true, files);

    expect(keysOf()).toEqual(['c.txt']);
  });

  it('covers the whole list at the boundaries', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);

    store().selectItem(files[4]!, 'file', 4, false, true, files);

    expect(keysOf()).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']);
  });

  it('keeps the anchor fixed so the range can be resized', () => {
    store().selectItem(files[1]!, 'file', 1, false, false, files);
    store().selectItem(files[4]!, 'file', 4, false, true, files);

    // Shrinking the range must measure from the original anchor, not from the
    // end of the previous range.
    store().selectItem(files[2]!, 'file', 2, false, true, files);

    expect(store().lastSelectedIndex).toBe(1);
    expect(keysOf()).toEqual(['b.txt', 'c.txt']);
  });

  it('replaces the previous selection rather than adding to it', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);
    store().selectItem(files[4]!, 'file', 4, true, false, files); // ctrl-add, anchor moves to 4

    store().selectItem(files[3]!, 'file', 3, false, true, files);

    expect(keysOf()).toEqual(['d.txt', 'e.txt']);
  });

  it('falls back to a single selection with no anchor', () => {
    // Shift-clicking as the very first interaction has nothing to range from.
    store().selectItem(files[2]!, 'file', 2, false, true, files);

    expect(keysOf()).toEqual(['c.txt']);
    expect(store().lastSelectedIndex).toBe(2);
  });
});

describe('mixing files and folders', () => {
  const folders = [folder('one/'), folder('two/')];

  it('discards a file selection when a folder is clicked', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);
    store().selectItem(files[1]!, 'file', 1, true, false, files);

    store().selectItem(folders[0]!, 'folder', 0, false, false, folders);

    // Bulk actions differ for files and folders, so the two cannot mix.
    expect(keysOf()).toEqual(['one/']);
    expect(store().selectedType).toBe('folder');
  });

  it('discards the old type even when ctrl is held', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);

    store().selectItem(folders[0]!, 'folder', 0, true, false, folders);

    expect(keysOf()).toEqual(['one/']);
  });

  it('discards the old type even when shift is held', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);

    store().selectItem(folders[1]!, 'folder', 1, false, true, folders);

    // The type check runs before the range branch, so no cross-type range is
    // ever built.
    expect(keysOf()).toEqual(['two/']);
  });

  it('identifies folders by prefix', () => {
    store().selectItem(folders[0]!, 'folder', 0, false, false, folders);

    expect(store().isSelected(folder('one/'))).toBe(true);
    expect(store().isSelected(folder('two/'))).toBe(false);
  });
});

describe('queries and clearing', () => {
  it('reports whether an item is selected', () => {
    store().selectItem(files[1]!, 'file', 1, false, false, files);

    expect(store().isSelected(files[1]!)).toBe(true);
    expect(store().isSelected(files[0]!)).toBe(false);
  });

  it('treats an item with neither key nor prefix as unselected', () => {
    store().selectItem(files[0]!, 'file', 0, false, false, files);

    // getItemKey returns '' for these, which must not match a real key.
    expect(store().isSelected({ name: 'orphan' } as unknown as FileItem)).toBe(false);
  });

  it('counts the selection', () => {
    expect(store().getSelectionCount()).toBe(0);

    store().selectItem(files[0]!, 'file', 0, false, false, files);
    store().selectItem(files[1]!, 'file', 1, true, false, files);

    expect(store().getSelectionCount()).toBe(2);
  });

  it('resets everything, including the anchor', () => {
    store().selectItem(files[2]!, 'file', 2, false, false, files);

    store().clearSelection();

    expect(store().selectedItems).toEqual([]);
    expect(store().selectedType).toBeNull();
    // Leaving the anchor behind would let the next shift-click build a range
    // from a row the user last touched minutes ago.
    expect(store().lastSelectedIndex).toBeNull();
  });
});
