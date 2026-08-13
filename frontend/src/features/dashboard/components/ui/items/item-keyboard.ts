import type React from 'react';

/** What a key press on a file or folder row should do. */
export type ItemKeyIntent = 'open' | 'select' | null;

/**
 * Enter and Space activate a row the same way a double click does, and the
 * modifiers mirror the mouse - Ctrl/Cmd toggles the selection, Shift extends it.
 *
 * Presses that bubble up from the overflow menu button are ignored, otherwise
 * opening the menu with the keyboard would also open the item behind it.
 */
export function getItemKeyIntent(event: React.KeyboardEvent<HTMLElement>): ItemKeyIntent {
  if (event.key !== 'Enter' && event.key !== ' ') return null;
  if (event.target !== event.currentTarget) return null;

  return event.ctrlKey || event.metaKey || event.shiftKey ? 'select' : 'open';
}
