/**
 * Reading a drag from the event in hand.
 *
 * The drag system used to ask a React context whether a drag was in progress,
 * which meant a handler could only do its job if some *other* handler had
 * already run and committed state. `dragenter` fires innermost-first, so a
 * folder row was asked to accept a drag before anything had recorded that one
 * was happening - and anything that stopped the event on its way up left that
 * record unwritten for the rest of the drag.
 *
 * Everything here is derived from the event instead, so no handler depends on
 * another having gone first.
 */

/** Marks an element as a folder that claims drops aimed at it. */
export const DROP_TARGET_ATTRIBUTE = 'data-drop-target-id';

/** A folder's drop target id, namespaced so it cannot collide with anything else. */
export function folderTargetId(folderId: string): string {
  return `folder-${folderId}`;
}

/**
 * Is this a drag of files from outside the browser?
 *
 * `types` carries `'Files'` from the first `dragenter` onward, in every
 * browser, for anything dragged in from the OS. A drag begun inside the page
 * carries whatever types it set on itself, so this stays false for one - which
 * is what stops a row dragged across the list from lighting up every folder.
 *
 * The files themselves stay unreadable until `drop`; the types are all that is
 * visible during the drag, which is precisely why they are the signal to use.
 */
export function isExternalFileDrag(
  dataTransfer: DataTransfer | null | undefined
): dataTransfer is DataTransfer {
  if (!dataTransfer?.types) return false;
  return Array.from(dataTransfer.types).includes('Files');
}

/**
 * The innermost folder under the pointer, or null for anywhere else.
 *
 * `dragover` bubbles from the deepest element the pointer is actually over, so
 * walking up from the event target and taking the first marked ancestor picks
 * out the same element the browser would hand a drop to. Asking the DOM this
 * on every move is what makes the highlight track the pointer exactly.
 *
 * The alternative - reconstructing it from a tally of `dragenter` and
 * `dragleave` - is what the list used to do, and it cannot be made reliable:
 * both fire once per *descendant*, so a row holding an icon, a label and a menu
 * button emits a burst of them, and a single unpaired leave strands the
 * highlight on a row the pointer has left.
 */
export function dropTargetIdAt(node: EventTarget | null): string | null {
  const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;

  return (
    element?.closest(`[${DROP_TARGET_ATTRIBUTE}]`)?.getAttribute(DROP_TARGET_ATTRIBUTE) ?? null
  );
}
