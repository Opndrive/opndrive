/**
 * Multi-select store for files and folders
 *
 * Features:
 * - Single click to select items
 * - Ctrl+Click to toggle selection
 * - Shift+Click to select range
 * - Files and folders can't be selected together
 * - ESC key or clicking outside (single item only) clears selection
 */

import { create } from 'zustand';
import { FileItem } from '../types/file';
import { Folder } from '../types/folder';

type SelectableItem = FileItem | Folder;
type ItemType = 'file' | 'folder';

interface MultiSelectState {
  selectedItems: SelectableItem[];
  selectedType: ItemType | null;
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

    // If selecting a different type, clear selection
    if (state.selectedType && state.selectedType !== type) {
      set({
        selectedItems: [item],
        selectedType: type,
        lastSelectedIndex: index,
      });
      return;
    }

    // Shift+Click: Range selection
    if (shiftKey && state.lastSelectedIndex !== null && state.selectedType === type) {
      const start = Math.min(state.lastSelectedIndex, index);
      const end = Math.max(state.lastSelectedIndex, index);
      const rangeItems = allItems.slice(start, end + 1);

      set({
        selectedItems: rangeItems,
        selectedType: type,
        lastSelectedIndex: index,
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
          selectedType: newSelection.length > 0 ? type : null,
          lastSelectedIndex: index,
        });
      } else {
        // Add to selection
        set({
          selectedItems: [...state.selectedItems, item],
          selectedType: type,
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
