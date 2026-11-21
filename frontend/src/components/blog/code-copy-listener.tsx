'use client';

import type { MouseEvent, ReactNode } from 'react';

const STATUS_VISIBLE_MS = 2000;
const resetTimers = new WeakMap<HTMLElement, number>();

function copyShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C';
}

function showStatus(button: HTMLButtonElement, state: 'copied' | 'selected') {
  const status = button.parentElement?.querySelector('.code-block-copy-status');

  button.dataset.state = state;
  if (status) {
    status.textContent = state === 'copied' ? 'Copied' : `Selected, press ${copyShortcut()}`;
  }

  // A second press inside the window restarts it rather than being cut short
  // by the first press's timer.
  window.clearTimeout(resetTimers.get(button));
  resetTimers.set(
    button,
    window.setTimeout(() => {
      delete button.dataset.state;
      if (status) status.textContent = '';
    }, STATUS_VISIBLE_MS)
  );
}

/**
 * Handles every copy button in a post with one listener.
 *
 * The buttons are part of the post's HTML (see `addCodeBlockToolbars`), not
 * React elements, so they cannot carry handlers of their own. Their clicks
 * bubble up to this wrapper instead.
 */
export function CodeCopyListener({ children }: { children: ReactNode }) {
  const handleClick = async (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-code-copy]');
    if (!button || !event.currentTarget.contains(button)) return;

    const pre = button.closest('.code-block')?.querySelector('pre');
    if (!pre) return;

    // WordPress ends most blocks with a newline. Pasted into a terminal, that
    // newline runs the command before the reader has looked at it.
    const text = (pre.textContent ?? '').replace(/\n+$/, '');

    try {
      await navigator.clipboard.writeText(text);
      showStatus(button, 'copied');
    } catch {
      // No Clipboard API (a plain-http origin) or permission refused. Select
      // the code instead, so the keyboard shortcut is all that is left to do.
      window.getSelection()?.selectAllChildren(pre);
      showStatus(button, 'selected');
    }
  };

  return <div onClick={handleClick}>{children}</div>;
}
