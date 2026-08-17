/**
 * Accessibility of the advanced search sheet.
 *
 * The sheet is not reachable from the UI yet - nothing renders it, see #80 -
 * so these are the only thing standing between it and shipping the same gaps
 * it has today the moment someone wires it up.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { AdvancedSearchSheet } from './advanced-search-sheet';

/** The sheet portals itself and only renders after its mount effect. */
async function open(onClose = vi.fn()) {
  const view = render(<AdvancedSearchSheet isOpen onClose={onClose} />);
  const panel = await screen.findByRole('dialog');
  return { ...view, panel, onClose };
}

describe('advanced search sheet', () => {
  it('announces itself as a dialog, named by its heading', async () => {
    const { panel } = await open();

    expect(panel.getAttribute('aria-modal')).toBe('true');

    // The name has to come from somewhere; an unnamed dialog is announced as
    // just "dialog". Resolved by hand rather than with toHaveAccessibleName,
    // which needs jest-dom and this suite does not pull it in.
    const labelledBy = panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Advanced search');
  });

  it('closes on Escape from anywhere, not just from inside the panel', async () => {
    const { onClose } = await open();

    // Fired at the document, which is where focus sits for a user who has not
    // tabbed into the sheet yet. An element-scoped handler would miss this.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus into the panel on open', async () => {
    const { panel } = await open();

    // Otherwise a keyboard user is left on the search bar behind it, tabbing
    // through a page they can no longer see.
    await waitFor(() => expect(document.activeElement).toBe(panel));
  });

  it('puts focus back where it came from on close', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender, panel } = await open();
    await waitFor(() => expect(document.activeElement).toBe(panel));

    await act(async () => {
      rerender(<AdvancedSearchSheet isOpen={false} onClose={vi.fn()} />);
    });

    // Not the top of the document, which is where an unmanaged close lands.
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('keeps the backdrop out of the accessibility tree', async () => {
    await open();

    // It is a mouse shortcut for something Escape and the close button already
    // do, so announcing it as a control would be noise.
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
  });
});
