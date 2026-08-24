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
  selectedType: SelectionType | null;
  lastSelectedIndex: number | null;

  // Actions
  selectItem: (
    item: SelectableItem,
    type: ItemType,
    index: number,
    ctrlKey: boolean,
    shiftKey: boolean,
    allItems: SelectableItem[]
  ) => void;
  clearSelection: () => void;
  isSelected: (item: SelectableItem) => boolean;
  getSelectionCount: () => number;
}

const isFolder = (item: SelectableItem): boolean => 'Prefix' in item && Boolean(item.Prefix);

/**
 * Read back off the items rather than tracked separately.
 *
 * A stored type and a stored list are two records of one fact, and the moment a
 * range spans both kinds they disagree. Deriving it means the answer cannot
 * drift from what is actually held.
 */
const typeOf = (items: SelectableItem[]): SelectionType | null => {
  if (items.length === 0) return null;

  const folders = items.filter(isFolder).length;

  if (folders === 0) return 'file';
  if (folders === items.length) return 'folder';

  return 'mixed';
};

const getItemKey = (item: SelectableItem): string => {
  if ('Key' in item && item.Key) {
    return item.Key;
  }
  if ('Prefix' in item && item.Prefix) {
    return item.Prefix;
  }
  return '';
};

export const useMultiSelectStore = create<MultiSelectState>((set, get) => ({
  selectedItems: [],
  selectedType: null,
  lastSelectedIndex: null,

  selectItem: (item, type, index, ctrlKey, shiftKey, allItems) => {
    const state = get();

    // Shift+Click: Select range from last clicked item to current item.
    // No longer gated on the anchor matching this item's type - the range runs
    // over the combined list, so crossing from folders into files is ordinary.
    if (shiftKey && state.lastSelectedIndex !== null) {
      const start = Math.min(state.lastSelectedIndex, index);
      const end = Math.max(state.lastSelectedIndex, index);
      const rangeItems = allItems.slice(start, end + 1);

      set({
        selectedItems: rangeItems,
        selectedType: typeOf(rangeItems),
        // Don't update lastSelectedIndex - keep the anchor point fixed
      });
      return;
    }

    // Ctrl+Click: Toggle selection
    if (ctrlKey) {
      const itemKey = getItemKey(item);
      const isCurrentlySelected = state.selectedItems.some(
        (selected) => getItemKey(selected) === itemKey
      );

      if (isCurrentlySelected) {
        // Remove from selection
        const newSelection = state.selectedItems.filter(
          (selected) => getItemKey(selected) !== itemKey
        );
        set({
          selectedItems: newSelection,
          selectedType: typeOf(newSelection),
          lastSelectedIndex: index,
        });
      } else {
        // Add to selection
        const newSelection = [...state.selectedItems, item];
        set({
          selectedItems: newSelection,
          selectedType: typeOf(newSelection),
          lastSelectedIndex: index,
        });
      }
      return;
    }

    // Regular click: Single selection
    set({
      selectedItems: [item],
      selectedType: type,
      lastSelectedIndex: index,
    });
  },

  clearSelection: () => {
    set({
      selectedItems: [],
      selectedType: null,
      lastSelectedIndex: null,
    });
  },

  isSelected: (item) => {
    const state = get();
    const itemKey = getItemKey(item);
    return state.selectedItems.some((selected) => getItemKey(selected) === itemKey);
  },

  getSelectionCount: () => {
    return get().selectedItems.length;
  },
}));
