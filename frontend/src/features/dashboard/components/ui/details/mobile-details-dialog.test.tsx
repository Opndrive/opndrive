/**
 * The details sheet only exists when it has something to show.
 *
 * It renders nothing without an item, but the details context exposes a
 * `toggle()` that flips the open flag without setting one, so "open with no
 * item" is reachable. It used to lock page scroll in that state, freezing the
 * page with nothing on screen to explain it.
 *
 * Scroll locking is Radix's job now rather than the shared hook's, so these
 * assert on what the user can reach: whether a dialog exists, whether the page
 * behind it is still reachable, and where focus ends up.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { MobileDetailsDialog } from './mobile-details-dialog';
import { getScrollLockHolders } from '@/hooks/use-scroll-lock';

const details = vi.hoisted(() => ({
  value: { isOpen: false, selectedItem: null as unknown, close: vi.fn() },
}));

vi.mock('@/context/details-context', () => ({
  useDetails: () => details.value,
}));

vi.mock('@/features/dashboard/hooks/use-file-metadata', () => ({
  useFileMetadata: () => ({ metadata: null, isLoading: false }),
}));

const file = { Key: 'reports/q3.pdf', name: 'q3.pdf', id: 'reports/q3.pdf' };

function show(state: { isOpen: boolean; selectedItem: unknown }) {
  details.value = { ...details.value, ...state };
  return render(
    <>
      <button>behind the dialog</button>
      <MobileDetailsDialog />
    </>
  );
}

afterEach(() => {
  cleanup();
  // Nothing here should ever be left holding the shared lock.
  expect(getScrollLockHolders()).toBe(0);
  expect(document.body.style.overflow).toBe('');
});

describe('when it should be on screen', () => {
  it('renders a dialog for the selected item', async () => {
    show({ isOpen: true, selectedItem: file });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());
    expect(screen.getByRole('dialog', { name: 'q3.pdf' })).toBeTruthy();
  });

  it('hides the page behind it from assistive tech', async () => {
    show({ isOpen: true, selectedItem: file });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());
    // Tab used to walk straight out into the page behind the backdrop.
    expect(screen.queryByRole('button', { name: 'behind the dialog' })).toBeNull();
  });

  it('closes on Escape', async () => {
    show({ isOpen: true, selectedItem: file });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(details.value.close).toHaveBeenCalled();
  });
});

describe('when it has nothing to show', () => {
  it('renders nothing when open with no item', () => {
    show({ isOpen: true, selectedItem: null });

    // The reachable state behind the old freeze: flag on, nothing selected.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('leaves the page behind reachable when it has no item', () => {
    show({ isOpen: true, selectedItem: null });

    expect(screen.queryByRole('button', { name: 'behind the dialog' })).not.toBeNull();
  });

  it('renders nothing when closed', () => {
    show({ isOpen: false, selectedItem: file });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
