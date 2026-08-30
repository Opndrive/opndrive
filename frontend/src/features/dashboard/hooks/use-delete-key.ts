'use client';

import { useEffect, useRef } from 'react';

/**
 * Whether this press is somebody typing rather than acting on a selection.
 *
 * Delete is an ordinary editing key. The search box, the rename dialog and the
 * create-folder field are all reachable while a selection exists, and removing
 * a character in one of them must not remove the files behind it.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Whether a modal is up, in which case the key belongs to it.
 *
 * Both kinds in this app carry `role="dialog"` - Radix's own and the
 * hand-rolled preview modal - and neither is in the document while closed. It
 * matters most for the confirmation this very feature raises: without it, the
 * press that confirmed one delete could start the next.
 */
function aDialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

/**
 * Runs `onDelete` when Delete is pressed, while `enabled`.
 *
 * The toolbar that mounts this is rendered on every dashboard page and returns
 * null without a selection, so the flag is what keeps the listener off the
 * window for the whole session rather than only while there is something to
 * act on.
 *
 * Backspace is deliberately not bound. It is "go back" in too many places to
 * take over for a destructive action.
 */
export function useDeleteKey(onDelete: () => void, enabled: boolean): void {
  // Kept in a ref so a toolbar re-render - which happens on every selection
  // change - does not tear the listener down and put an identical one back.
  const latest = useRef(onDelete);
  useEffect(() => {
    latest.current = onDelete;
  }, [onDelete]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      // A held key would otherwise stack a confirmation per repeat.
      if (event.repeat) return;
      // Modifier combinations belong to the browser or the OS.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (aDialogIsOpen()) return;

      event.preventDefault();
      latest.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
