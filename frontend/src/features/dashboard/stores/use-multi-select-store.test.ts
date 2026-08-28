/**
 * Multi-select store: the click/ctrl/shift selection state machine.
 *
 * Almost all the behaviour lives in one `selectItem` call whose meaning changes
 * with the modifier keys, so the cases below are grouped by modifier rather
 * than by action name.
 *
 * Identity comes from `itemKey`, which reads `id` first and falls back to
 * `Key`, then `Prefix`. Two different objects describing the same item are the
 * same selection. The fixtures below carry no `id`, so they exercise the key
 * and prefix fallbacks; the id path is pinned separately.
 *
 * The kind of a selection is derived from the items. Callers used to pass a
 * literal `'file'` or `'folder'` alongside the item, and only the plain-click
 * path read it - so the same folder reported one thing when clicked and another
 * when ctrl-clicked. The argument is gone; the cases below pin what replaced it.
 */

import { describe, it, expect } from 'vitest';
import { useMultiSelectStore } from './use-multi-select-store';
import type { FileItem } from '../types/file';
import type { Folder } from '../types/folder';

const store = () => useMultiSelectStore.getState();

const file = (key: string) => ({ Key: key, name: key }) as FileItem;
const folder = (prefix: string) => ({ Prefix: prefix, name: prefix }) as Folder;

/**
 * A folder written as an object rather than inferred from a delimiter.
 *
 * S3 has no directories. A folder either comes back as a CommonPrefix, which
 * carries a `Prefix`, or as a zero-byte object whose key ends in a slash. The
 * second kind is shaped exactly like a file, and the trailing slash is the only
 * thing separating them.
 */
const marker = (key: string) => ({ Key: key, name: key }) as FileItem;

/** Five files, so range selections have room to move in both directions. */
const files = [file('a.txt'), file('b.txt'), file('c.txt'), file('d.txt'), file('e.txt')];

/**
 * The S3 key of each selected item, which is what these cases read for.
 *
 * Deliberately not a copy of `itemKey`: that prefers `id`, and asserting
 * against a mirror of the implementation would pass however the implementation
 * drifted. These fixtures carry no `id`, so the two agree here anyway.
 */
const keysOf = () =>
  store().selectedItems.map((item) => {
    const record = item as unknown as { Key?: string; Prefix?: string };
    return record.Key ?? record.Prefix ?? '';
  });

describe('plain click', () => {
  it('selects exactly one item', () => {
    store().selectItem(files[1]!, 1, false, false, files);

    expect(keysOf()).toEqual(['b.txt']);
    expect(store().selectedType).toBe('file');
    expect(store().lastSelectedIndex).toBe(1);
  });

  it('replaces an existing selection', () => {
    store().selectItem(files[0]!, 0, true, false, files);
    store().selectItem(files[1]!, 1, true, false, files);

    store().selectItem(files[3]!, 3, false, false, files);

    expect(keysOf()).toEqual(['d.txt']);
  });
});

describe('ctrl+click', () => {
  it('adds to the selection', () => {
    store().selectItem(files[0]!, 0, false, false, files);
    store().selectItem(files[2]!, 2, true, false, files);

    expect(keysOf()).toEqual(['a.txt', 'c.txt']);
  });

  it('removes an item that is already selected', () => {
    store().selectItem(files[0]!, 0, false, false, files);
    store().selectItem(files[1]!, 1, true, false, files);

    store().selectItem(files[0]!, 0, true, false, files);

    expect(keysOf()).toEqual(['b.txt']);
  });

  it('matches by key, not by object identity', () => {
    store().selectItem(files[0]!, 0, false, false, files);

    // A re-render hands the UI a fresh object for the same S3 key.
    store().selectItem(file('a.txt'), 0, true, false, files);

    expect(keysOf()).toEqual([]);
  });

  it('drops the type once the last item is deselected', () => {
    store().selectItem(files[0]!, 0, false, false, files);

    store().selectItem(files[0]!, 0, true, false, files);

    // A lingering type would keep blocking folder selection.
    expect(store().selectedItems).toEqual([]);
    expect(store().selectedType).toBeNull();
  });

  it('keeps the type while anything is still selected', () => {
    store().selectItem(files[0]!, 0, false, false, files);
    store().selectItem(files[1]!, 1, true, false, files);

    store().selectItem(files[0]!, 0, true, false, files);

    expect(store().selectedType).toBe('file');
  });

  it('starts a selection from nothing', () => {
    store().selectItem(files[2]!, 2, true, false, files);

    expect(keysOf()).toEqual(['c.txt']);
    expect(store().selectedType).toBe('file');
  });
});

describe('shift+click range', () => {
  it('selects downwards from the anchor', () => {
    store().selectItem(files[1]!, 1, false, false, files);

    store().selectItem(files[3]!, 3, false, true, files);

    expect(keysOf()).toEqual(['b.txt', 'c.txt', 'd.txt']);
  });

  it('selects upwards from the anchor', () => {
    store().selectItem(files[3]!, 3, false, false, files);

    store().selectItem(files[1]!, 1, false, true, files);

    // Range is min..max, so direction does not matter.
    expect(keysOf()).toEqual(['b.txt', 'c.txt', 'd.txt']);
  });

  it('selects a single item when the range collapses', () => {
    store().selectItem(files[2]!, 2, false, false, files);

    store().selectItem(files[2]!, 2, false, true, files);

    expect(keysOf()).toEqual(['c.txt']);
  });

  it('covers the whole list at the boundaries', () => {
    store().selectItem(files[0]!, 0, false, false, files);

    store().selectItem(files[4]!, 4, false, true, files);

    expect(keysOf()).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']);
  });

  it('keeps the anchor fixed so the range can be resized', () => {
    store().selectItem(files[1]!, 1, false, false, files);
    store().selectItem(files[4]!, 4, false, true, files);

    // Shrinking the range must measure from the original anchor, not from the
    // end of the previous range.
    store().selectItem(files[2]!, 2, false, true, files);

    expect(store().lastSelectedIndex).toBe(1);
    expect(keysOf()).toEqual(['b.txt', 'c.txt']);
  });

  it('replaces the previous selection rather than adding to it', () => {
    store().selectItem(files[0]!, 0, false, false, files);
    store().selectItem(files[4]!, 4, true, false, files); // ctrl-add, anchor moves to 4

    store().selectItem(files[3]!, 3, false, true, files);

    expect(keysOf()).toEqual(['d.txt', 'e.txt']);
  });

  it('falls back to a single selection with no anchor', () => {
    // Shift-clicking as the very first interaction has nothing to range from.
    store().selectItem(files[2]!, 2, false, true, files);

    expect(keysOf()).toEqual(['c.txt']);
    expect(store().lastSelectedIndex).toBe(2);
  });
});

describe('mixing files and folders', () => {
  const folders = [folder('one/'), folder('two/')];

  it('replaces the selection on a plain click, whatever was held before', () => {
    store().selectItem(files[0]!, 0, false, false, files);
    store().selectItem(files[1]!, 1, true, false, files);

    store().selectItem(folders[0]!, 0, false, false, folders);

    // A click with no modifier still means "just this one" - mixing is what
    // ctrl and shift are for.
    expect(keysOf()).toEqual(['one/']);
    expect(store().selectedType).toBe('folder');
  });

  // The list view shows folders and files as one table, so a selection that
  // spans both is an ordinary thing to build rather than a rule to refuse.
  const combined = [folders[0]!, folders[1]!, files[0]!, files[1]!];

  it('adds a folder to a file selection when ctrl is held', () => {
    store().selectItem(files[0]!, 2, false, false, combined);

    store().selectItem(folders[0]!, 0, true, false, combined);

    expect(keysOf().sort()).toEqual(['one/', 'a.txt'].sort());
    expect(store().selectedType).toBe('mixed');
  });

  it('carries a shift range across the folder-file boundary', () => {
    store().selectItem(folders[1]!, 1, false, false, combined);

    store().selectItem(files[0]!, 2, false, true, combined);

    // Everything between the anchor and the target, whichever kind it is.
    expect(keysOf()).toEqual(['two/', 'a.txt']);
    expect(store().selectedType).toBe('mixed');
  });

  // Callers ask "is this files only" to decide whether open, download and share
  // apply. Mixed has to answer no without pretending to be one or the other.
  it('reports a single kind as that kind, not as mixed', () => {
    store().selectItem(folders[0]!, 0, false, false, combined);
    store().selectItem(folders[1]!, 1, true, false, combined);

    expect(store().selectedType).toBe('folder');
  });

  it('falls back to the remaining kind when the odd one out is removed', () => {
    store().selectItem(folders[0]!, 0, false, false, combined);
    store().selectItem(files[0]!, 2, true, false, combined);
    expect(store().selectedType).toBe('mixed');

    // Ctrl-clicking the folder again drops it, leaving only files behind.
    store().selectItem(folders[0]!, 0, true, false, combined);

    expect(store().selectedType).toBe('file');
  });

  it('identifies folders by prefix', () => {
    store().selectItem(folders[0]!, 0, false, false, folders);

    expect(store().isSelected(folder('one/'))).toBe(true);
    expect(store().isSelected(folder('two/'))).toBe(false);
  });
});

describe('queries and clearing', () => {
  it('reports whether an item is selected', () => {
    store().selectItem(files[1]!, 1, false, false, files);

    expect(store().isSelected(files[1]!)).toBe(true);
    expect(store().isSelected(files[0]!)).toBe(false);
  });

  it('treats an item with neither key nor prefix as unselected', () => {
    store().selectItem(files[0]!, 0, false, false, files);

    // These used to key to the empty string, which matched nothing real but
    // matched each other - see the identity cases below.
    expect(store().isSelected({ name: 'orphan' } as unknown as FileItem)).toBe(false);
  });

  it('counts the selection', () => {
    expect(store().getSelectionCount()).toBe(0);

    store().selectItem(files[0]!, 0, false, false, files);
    store().selectItem(files[1]!, 1, true, false, files);

    expect(store().getSelectionCount()).toBe(2);
  });

  it('resets everything, including the anchor', () => {
    store().selectItem(files[2]!, 2, false, false, files);

    store().clearSelection();

    expect(store().selectedItems).toEqual([]);
    expect(store().selectedType).toBeNull();
    // Leaving the anchor behind would let the next shift-click build a range
    // from a row the user last touched minutes ago.
    expect(store().lastSelectedIndex).toBeNull();
  });
});

/**
 * The kind of a selection is read off the items, and nowhere else.
 *
 * There is no longer an argument that could contradict them, which is what
 * these cases are really holding down: the item is the only input.
 */
describe('deriving the kind', () => {
  it('reads a folder off its prefix on a plain click', () => {
    store().selectItem(folder('one/'), 0, false, false, [folder('one/')]);

    // The plain-click path was the one that used to store the caller's literal,
    // so it is where the answer used to be able to differ from the item.
    expect(store().selectedType).toBe('folder');
  });

  it('gives the same answer however the item was selected', () => {
    const one = folder('one/');

    store().selectItem(one, 0, false, false, [one]);
    const byClick = store().selectedType;

    store().clearSelection();
    store().selectItem(one, 0, true, false, [one]);
    const byCtrlClick = store().selectedType;

    expect(byClick).toBe('folder');
    expect(byCtrlClick).toBe('folder');
  });

  it('counts a folder stored as an object as a folder', () => {
    const photos = marker('photos/');

    store().selectItem(photos, 0, false, false, [photos]);

    // Selecting one must grey out open, download and share the same way a
    // CommonPrefix folder does. Reading only `Prefix` reported it as a file.
    expect(store().selectedType).toBe('folder');
  });

  it('still calls an ordinary file a file', () => {
    store().selectItem(files[0]!, 0, false, false, files);

    expect(store().selectedType).toBe('file');
  });

  it('reports a marker held alongside a file as mixed', () => {
    const photos = marker('photos/');
    const combined = [photos, files[0]!];

    store().selectItem(photos, 0, false, false, combined);
    store().selectItem(files[0]!, 1, true, false, combined);

    expect(store().selectedType).toBe('mixed');
  });

  it('reports a marker held alongside a prefix folder as folders', () => {
    const photos = marker('photos/');
    const combined = [photos, folder('one/')];

    store().selectItem(photos, 0, false, false, combined);
    store().selectItem(combined[1]!, 1, true, false, combined);

    // Two spellings of the same idea are not a mixed selection.
    expect(store().selectedType).toBe('folder');
  });
});

describe('identity', () => {
  it('uses the id when there is no key or prefix to fall back to', () => {
    // enrichFolder and enrichFile both generate an id when the S3 field is
    // absent, which is what makes it the only safe first choice. Reading the
    // key first meant these three were indistinguishable.
    const one = { id: 'file-generated-1', name: 'one' } as FileItem;
    const rebuilt = { id: 'file-generated-1', name: 'one' } as FileItem;
    const other = { id: 'file-generated-2', name: 'two' } as FileItem;

    store().selectItem(one, 0, false, false, [one, other]);

    // A re-render hands over a fresh object for the same item.
    expect(store().isSelected(rebuilt)).toBe(true);
    expect(store().isSelected(other)).toBe(false);
  });

  it('keeps two items with no identifier apart', () => {
    const one = { name: 'orphan one' } as FileItem;
    const two = { name: 'orphan two' } as FileItem;

    store().selectItem(one, 0, false, false, [one, two]);

    // Both used to key to the empty string, so they were one item: selecting
    // either showed both selected, and ctrl-clicking one removed both.
    expect(store().isSelected(one)).toBe(true);
    expect(store().isSelected(two)).toBe(false);
  });

  it('answers the same way every time it is asked about one item', () => {
    const orphan = { name: 'orphan' } as FileItem;

    store().selectItem(orphan, 0, false, false, [orphan]);

    // The fallback identifier has to be stable, or selection would forget an
    // item between one render and the next.
    expect(store().isSelected(orphan)).toBe(true);
    expect(store().isSelected(orphan)).toBe(true);
  });
});
