/**
 * Delete removes the selection, and the cases where it must not.
 *
 * The guards are the whole substance of this hook: the delete itself is the
 * toolbar's existing path. What is worth pinning is every press that has to be
 * left alone, because getting one of those wrong destroys a user's files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDeleteKey } from './use-delete-key';

function press(key: string, init: KeyboardEventInit = {}, target?: Element) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  (target ?? window).dispatchEvent(event);
  return event;
}

let onDelete: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onDelete = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useDeleteKey', () => {
  it('deletes the selection on Delete', () => {
    renderHook(() => useDeleteKey(onDelete, true));

    press('Delete');

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('stops the browser acting on the same press', () => {
    renderHook(() => useDeleteKey(onDelete, true));

    expect(press('Delete').defaultPrevented).toBe(true);
  });

  it('does nothing without a selection', () => {
    // The toolbar is mounted on every dashboard page and renders nothing until
    // something is selected, so the flag is what keeps this off the window.
    renderHook(() => useDeleteKey(onDelete, false));

    press('Delete');

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ignores every other key', () => {
    renderHook(() => useDeleteKey(onDelete, true));

    press('Backspace');
    press('Enter');
    press('d');

    // Backspace especially: it is "go back" in too many places to take over
    // for something that cannot be undone.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ignores a held key', () => {
    renderHook(() => useDeleteKey(onDelete, true));

    press('Delete', { repeat: true });

    // Otherwise leaning on the key stacks one confirmation per repeat.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)(
    'ignores Delete held with %s',
    (modifier) => {
      renderHook(() => useDeleteKey(onDelete, true));

      press('Delete', { [modifier]: true });

      expect(onDelete).not.toHaveBeenCalled();
    }
  );

  it.each(['input', 'textarea', 'select'])('ignores a press while typing in a %s', (tag) => {
    const field = document.createElement(tag);
    document.body.appendChild(field);
    renderHook(() => useDeleteKey(onDelete, true));

    press('Delete', {}, field);

    // Removing a character in the search box must not remove the files behind
    // it, and both are reachable at the same time.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ignores a press in a contenteditable', () => {
    const field = document.createElement('div');
    field.contentEditable = 'true';
    Object.defineProperty(field, 'isContentEditable', { value: true });
    document.body.appendChild(field);
    renderHook(() => useDeleteKey(onDelete, true));

    press('Delete', {}, field);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ignores a press while a dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    renderHook(() => useDeleteKey(onDelete, true));

    press('Delete');

    // This one matters most for the confirmation the delete itself raises:
    // without it the press that confirmed one delete would start the next.
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('acts again once the dialog is gone', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    renderHook(() => useDeleteKey(onDelete, true));

    press('Delete');
    dialog.remove();
    press('Delete');

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('calls the newest handler, not the one it mounted with', () => {
    const replacement = vi.fn();
    const { rerender } = renderHook(({ handler }) => useDeleteKey(handler, true), {
      initialProps: { handler: onDelete as () => void },
    });

    rerender({ handler: replacement as () => void });
    press('Delete');

    // The toolbar re-renders on every selection change, so the handler is a
    // fresh closure each time and the listener must not hold the stale one.
    expect(onDelete).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useDeleteKey(onDelete, true));

    unmount();
    press('Delete');

    expect(onDelete).not.toHaveBeenCalled();
  });
});
