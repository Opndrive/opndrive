/**
 * Shared look for the overflow menus.
 *
 * The three menus are now Radix dropdowns, which come with their own popover
 * styling. These classes put the app's existing appearance back on top, so the
 * move to Radix changes behaviour without changing how the menus look.
 */

/** Panel: wider and more padded than the shadcn default, on the secondary surface. */
export const menuContentClass =
  'min-w-[200px] max-h-[calc(100vh-16px)] overflow-y-auto p-2 bg-secondary border-border rounded-lg shadow-xl';

/** Row: taller and roomier than the shadcn default, matching the old buttons. */
export const menuItemClass = 'gap-3 px-3 py-2.5 text-sm rounded-md cursor-pointer';
