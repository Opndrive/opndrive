/**
 * The details sheet locks page scroll only when it is actually on screen.
 *
 * It renders null unless it has both an open flag and an item, but it used to
 * lock scroll on the flag alone. The details context exposes a `toggle()` that
 * flips the flag without setting an item, so that combination is reachable and
 * leaves the page frozen with nothing rendered to explain it - the same class
 * of failure the shared scroll lock exists to prevent.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
  return render(<MobileDetailsDialog />);
}

afterEach(() => {
  cleanup();
  expect(getScrollLockHolders()).toBe(0);
  expect(document.body.style.overflow).toBe('');
});

describe('scroll locking follows what is rendered', () => {
  it('locks when open with an item', () => {
    show({ isOpen: true, selectedItem: file });

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not lock when open with no item', () => {
    const { container } = show({ isOpen: true, selectedItem: null });

    // Nothing is rendered, so nothing should be holding the page still.
    expect(container.innerHTML).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(getScrollLockHolders()).toBe(0);
  });

  it('does not lock when closed', () => {
    show({ isOpen: false, selectedItem: file });

    expect(document.body.style.overflow).toBe('');
  });

  it('releases the lock when it unmounts', () => {
    const { unmount } = show({ isOpen: true, selectedItem: file });
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });
});
