/**
 * useDeleteUnloadGuard.
 *
 * The guard has to be exactly as sticky as the delete it protects: missing it
 * loses objects, and leaving it attached afterwards means a spurious "leave
 * site?" prompt on every later navigation. Both directions are covered here by
 * dispatching a real cancelable event rather than by spying on
 * addEventListener, so an implementation that registers but never prevents
 * would still fail.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeleteUnloadGuard } from './use-delete-unload-guard';
import { useUploadStore } from '../stores/use-upload-store';

type DeleteStatus = 'queued' | 'deleting' | 'completed' | 'failed' | 'cancelled';

// Wrapped because subscribers re-render when this lands mid-test
function seedDelete(status: DeleteStatus, id = 'op-1') {
  act(() => {
    useUploadStore.setState({
      deletes: {
        [id]: {
          id,
          name: 'docs',
          status,
          progress: 10,
          type: 'folder',
        },
      },
    });
  });
}

/** Returns true when something asked the browser to stop the unload. */
function unloadWasBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  useUploadStore.setState({ deletes: {} });
});

describe('while a delete is running', () => {
  it('blocks the tab from closing', () => {
    seedDelete('deleting');
    renderHook(() => useDeleteUnloadGuard());

    expect(unloadWasBlocked()).toBe(true);
  });

  it('starts blocking when a delete begins after mount', () => {
    const { rerender } = renderHook(() => useDeleteUnloadGuard());
    expect(unloadWasBlocked()).toBe(false);

    seedDelete('deleting');
    rerender();

    expect(unloadWasBlocked()).toBe(true);
  });
});

describe('when nothing is running', () => {
  it('lets the tab close', () => {
    renderHook(() => useDeleteUnloadGuard());

    expect(unloadWasBlocked()).toBe(false);
  });

  it.each<DeleteStatus>(['queued', 'completed', 'failed', 'cancelled'])(
    'does not block for a %s operation',
    (status) => {
      seedDelete(status);
      renderHook(() => useDeleteUnloadGuard());

      expect(unloadWasBlocked()).toBe(false);
    }
  );

  it('stops blocking once the delete finishes', () => {
    seedDelete('deleting');
    const { rerender } = renderHook(() => useDeleteUnloadGuard());
    expect(unloadWasBlocked()).toBe(true);

    seedDelete('completed');
    rerender();

    expect(unloadWasBlocked()).toBe(false);
  });

  it('detaches on unmount so later navigation is not prompted', () => {
    seedDelete('deleting');
    const { unmount } = renderHook(() => useDeleteUnloadGuard());

    unmount();

    expect(unloadWasBlocked()).toBe(false);
  });
});
