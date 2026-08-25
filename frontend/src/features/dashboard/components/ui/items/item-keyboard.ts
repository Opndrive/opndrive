import type React from 'react';

/** What a key press on a file or folder row should do. */
export type ItemKeyIntent = 'open' | 'select' | null;

/**
 * Enter and Space activate a row the same way a double click does, and the
 * modifiers mirror the mouse - Ctrl/Cmd toggles the selection, Shift extends it.
 *
 * Three kinds of press are deliberately ignored:
 * - anything that bubbled up from the overflow menu button or the open menu,
 *   otherwise opening the menu with the keyboard would also open the item
 *   behind it
 * - a held key repeating, which would otherwise navigate or open a preview
 *   once per repeat
 * - Alt combinations, which belong to the operating system rather than to us
 */
export function getItemKeyIntent(event: React.KeyboardEvent<HTMLElement>): ItemKeyIntent {
  if (event.key !== 'Enter' && event.key !== ' ') return null;
  if (event.target !== event.currentTarget) return null;
  if (event.repeat || event.altKey) return null;

  return event.ctrlKey || event.metaKey || event.shiftKey ? 'select' : 'open';
}

/**
 * Whether this press is about to open a row's overflow menu.
 *
 * Radix opens the menu from its own `onKeyDown` and calls `preventDefault`,
 * which stops the browser synthesising the click that the mouse path selects
 * on. So tabbing to the button and pressing Enter opened a menu over an
 * unselected row, and the toolbar never appeared to say what it would act on.
 *
 * These are the three keys Radix itself opens on, listed here rather than in
 * each row component so they cannot drift apart from one another.
 */
export function opensMenuOnKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown';
}
