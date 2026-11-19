/**
 * Multi-select store for files and folders
 *
 * Features:
 * - Single click to select items
 * - Ctrl+Click to toggle selection
 * - Shift+Click to select range from last clicked item (keeps only items in the range)
 * - Files and folders can be selected together
 * - ESC key or clicking outside (single item only) clears selection
 *
 * Mixed selection exists because the list view shows folders and files as one
 * table. Refusing to hold both meant a shift-drag down that table silently threw
 * away everything above the boundary, which reads as a bug rather than a rule.
 * The index passed in is therefore an index into that combined list, not into
 * whichever half the item came from.
 */

import { create } from 'zustand';
import { FileItem } from '../types/file';
import { Folder } from '../types/folder';
import { isFolderLike, itemKey as getItemKey } from '@/shared/utils/drive-item';

type SelectableItem = FileItem | Folder;
type ItemType = 'file' | 'folder';

/**
 * What is currently held. `mixed` is the honest answer for a selection spanning
 * both, and callers already treat anything that is not `file` as "not files
 * only" - the toolbar greys open, download and share on exactly that test, and
 * leaves delete enabled, which is the behaviour a mixed selection wants.
 */
type SelectionType = ItemType | 'mixed';

interface MultiSelectState {
  selectedItems: SelectableItem[];
  /**
   * The keys of `selectedItems`, kept beside it so asking whether a row is
   * selected costs a lookup rather than a scan. Every drawn row asks on every
   * render, and "select all" in a large folder holds tens of thousands.
   */
  selectedKeys: ReadonlySet<string>;
  selectedType: SelectionType | null;
  lastSelectedIndex: number | null;
  /**
   * The key of the row `lastSelectedIndex` counted to, so a range can tell
   * whether it is still being measured against the same list.
   *
   * Indices only mean anything relative to the array they came from, and not
   * every view has one array. My Drive's list numbers folders and files
   * together; Home and search render them as separate sections, each numbering
   * from zero. Without this, anchoring on the third folder in Home and then
   * shift-clicking a file sliced the files array from index three and selected
   * a block that had nothing to do with either click.
   */
  anchorKey: string | null;

  // Actions
  /**
   * Takes no item type.
   *
   * Callers used to pass a literal `'file'` or `'folder'` alongside the item.
   * It was a fifth answer to a question the item itself can be asked, and only
   * the plain-click path ever read it - so the same folder reported one thing
   * when clicked and another when ctrl-clicked, because those paths had always
   * derived it. Every path derives now, and there is nothing left to disagree.
   */
  selectItem: (
    item: SelectableItem,
    index: number,
    ctrlKey: boolean,
    shiftKey: boolean,
    allItems: SelectableItem[]
  ) => void;
  /**
   * Holds exactly these items, in order. For "select all", which can only ever
   * mean the items that are loaded: S3 gives no way to act on a key it has not
   * listed yet.
   */
  selectAll: (items: SelectableItem[]) => void;
  clearSelection: () => void;
  isSelected: (item: SelectableItem) => boolean;
  getSelectionCount: () => number;
}

/**
 * Read back off the items rather than tracked separately.
 *
 * A stored type and a stored list are two records of one fact, and the moment a
 * range spans both kinds they disagree. Deriving it means the answer cannot
 * drift from what is actually held.
 *
 * `isFolderLike` rather than a local test: a folder written as an object whose
 * key ends in a slash is still a folder to the person selecting it, and the
 * toolbar has to grey the same actions for it.
 */
const typeOf = (items: SelectableItem[]): SelectionType | null => {
  if (items.length === 0) return null;

  const folders = items.filter(isFolderLike).length;

  if (folders === 0) return 'file';
  if (folders === items.length) return 'folder';

  return 'mixed';
};

/** A selection and everything derived from it, so the three cannot disagree. */
const holding = (items: SelectableItem[]) => ({
  selectedItems: items,
  selectedKeys: new Set(items.map(getItemKey)),
  selectedType: typeOf(items),
});

export const useMultiSelectStore = create<MultiSelectState>((set, get) => ({
  selectedItems: [],
  selectedKeys: new Set<string>(),
  selectedType: null,
  lastSelectedIndex: null,
  anchorKey: null,

  selectItem: (item, index, ctrlKey, shiftKey, allItems) => {
    const state = get();

    // Shift+Click: Select range from last clicked item to current item.
    //
    // No longer gated on the anchor matching this item's type - in one table
    // the range runs over the combined list, so crossing from folders into
    // files is ordinary. It is gated on the anchor still being where it was
    // instead: a view that numbers folders and files separately hands over an
    // index that means nothing in this array, and slicing on it would select
    // rows the user never pointed at.
    //
    // The anchor is found by its key when it is no longer at its index. Rows
    // move while a folder is still loading: a folder found on a later page
    // joins the folders above every file, and each file below it is then one
    // further down than when it was clicked. A view that numbers its sections
    // separately still gets no range, because the anchor is not in its array.
    const anchorIndex = (() => {
      if (state.lastSelectedIndex === null || state.anchorKey === null) return null;
      const at = allItems[state.lastSelectedIndex];
      if (at && getItemKey(at) === state.anchorKey) return state.lastSelectedIndex;
      const found = allItems.findIndex((candidate) => getItemKey(candidate) === state.anchorKey);
      return found < 0 ? null : found;
    })();

    if (shiftKey && anchorIndex !== null) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const rangeItems = allItems.slice(start, end + 1);

      set({
        ...holding(rangeItems),
        // Don't update lastSelectedIndex - keep the anchor point fixed
      });
      return;
    }

    // Ctrl+Click: Toggle selection
    if (ctrlKey) {
      const itemKey = getItemKey(item);
      const isCurrentlySelected = state.selectedKeys.has(itemKey);

      if (isCurrentlySelected) {
        // Remove from selection
        const newSelection = state.selectedItems.filter(
          (selected) => getItemKey(selected) !== itemKey
        );
        set({
          ...holding(newSelection),
          lastSelectedIndex: index,
          anchorKey: itemKey,
        });
      } else {
        // Add to selection
        const newSelection = [...state.selectedItems, item];
        set({
          ...holding(newSelection),
          lastSelectedIndex: index,
          anchorKey: itemKey,
        });
      }
      return;
    }

    // Regular click: Single selection.
    //
    // Derived from the item, like every other path here.
    set({
      ...holding([item]),
      lastSelectedIndex: index,
      anchorKey: getItemKey(item),
    });
  },

  selectAll: (items) => {
    // No anchor: a shift-click after "select all" starts a fresh range.
    set({ ...holding(items), lastSelectedIndex: null, anchorKey: null });
  },

  clearSelection: () => {
    set({
      ...holding([]),
      lastSelectedIndex: null,
      anchorKey: null,
    });
  },

  isSelected: (item) => get().selectedKeys.has(getItemKey(item)),

  getSelectionCount: () => {
    return get().selectedItems.length;
  },
}));
