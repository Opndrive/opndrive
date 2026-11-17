/**
 * useUnloadGuard.
 *
 * The guard has to be exactly as sticky as the work it protects: missing it
 * loses an upload or leaves a folder half deleted, and leaving it attached
 * afterwards means a spurious "leave site?" prompt on every later navigation.
 * Both directions are covered here by dispatching a real cancelable event
 * rather than by spying on addEventListener, so an implementation that
 * registers but never prevents would still fail.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { UploadStatus } from '@opndrive/s3-api';
import { useUnloadGuard } from './use-unload-guard';
import { useUploadStore } from '../stores/use-upload-store';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';

type DeleteStatus = 'queued' | 'deleting' | 'completed' | 'failed' | 'cancelled';

// Wrapped because subscribers re-render when these land mid-test
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

function seedUploads(...statuses: UploadStatus[]) {
  act(() => {
    useUploadStore.setState({
      uploads: Object.fromEntries(
        statuses.map((status, i) => [
          `u${i}`,
          { id: `u${i}`, name: `file-${i}.bin`, type: 'file' as const, status, progress: 10 },
        ])
      ),
    });
  });
}

function setPlanning(isPlanning: boolean) {
  act(() => {
    useUploadQueueStore.setState({ isPlanning });
  });
}

/** Returns true when something asked the browser to stop the unload. */
function unloadWasBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  useUploadStore.setState({ uploads: {}, deletes: {} });
  useUploadQueueStore.setState({ isPlanning: false, preparingDrops: 0 });
});

describe('while an upload is unfinished', () => {
  it.each<UploadStatus>(['queued', 'uploading', 'paused'])(
    'blocks the tab from closing for a %s upload',
    (status) => {
      seedUploads(status);
      renderHook(() => useUnloadGuard());

      expect(unloadWasBlocked()).toBe(true);
    }
  );

  it('blocks while one upload of many is still going', () => {
    // The live one last, behind everything that finished: the check has to
    // look past the finished ones, not just at the first.
    seedUploads('completed', 'failed', 'cancelled', 'completed', 'uploading');
    renderHook(() => useUnloadGuard());

    expect(unloadWasBlocked()).toBe(true);
  });

  it('starts blocking when an upload is added after mount', () => {
    const { rerender } = renderHook(() => useUnloadGuard());
    expect(unloadWasBlocked()).toBe(false);

    seedUploads('queued');
    rerender();

    expect(unloadWasBlocked()).toBe(true);
  });

  it('stops blocking once the last upload finishes', () => {
    seedUploads('completed', 'uploading');
    const { rerender } = renderHook(() => useUnloadGuard());
    expect(unloadWasBlocked()).toBe(true);

    seedUploads('completed', 'completed');
    rerender();

    expect(unloadWasBlocked()).toBe(false);
  });

  it.each<UploadStatus>(['completed', 'failed', 'cancelled'])(
    'does not block for a %s upload',
    (status) => {
      // A failed upload can still be retried from the panel, but nothing is
      // in flight to lose, and a prompt on every close until it is cleared
      // would teach people to ignore the prompt.
      seedUploads(status);
      renderHook(() => useUnloadGuard());

      expect(unloadWasBlocked()).toBe(false);
    }
  );
});

describe('while a drop is being planned', () => {
  // A large folder takes a while to read and check before its first upload
  // card exists. Closing then loses the drop just as surely.
  it('blocks the tab from closing', () => {
    setPlanning(true);
    renderHook(() => useUnloadGuard());

    expect(unloadWasBlocked()).toBe(true);
  });

  it('blocks while a dropped folder is still being read or checked', () => {
    // Before planning starts: reading the files from disk, and checking loose
    // ones against the bucket. Closing then loses the drop just the same.
    act(() => {
      useUploadQueueStore.setState({ preparingDrops: 1 });
    });
    const { rerender } = renderHook(() => useUnloadGuard());
    expect(unloadWasBlocked()).toBe(true);

    act(() => {
      useUploadQueueStore.setState({ preparingDrops: 0 });
    });
    rerender();
    expect(unloadWasBlocked()).toBe(false);
  });

  it('stops blocking when planning ends with nothing to upload', () => {
    setPlanning(true);
    const { rerender } = renderHook(() => useUnloadGuard());

    setPlanning(false);
    rerender();

    expect(unloadWasBlocked()).toBe(false);
  });
});

describe('while a delete is running', () => {
  it('blocks the tab from closing', () => {
    seedDelete('deleting');
    renderHook(() => useUnloadGuard());

    expect(unloadWasBlocked()).toBe(true);
  });

  it('starts blocking when a delete begins after mount', () => {
    const { rerender } = renderHook(() => useUnloadGuard());
    expect(unloadWasBlocked()).toBe(false);

    seedDelete('deleting');
    rerender();

    expect(unloadWasBlocked()).toBe(true);
  });

  it('keeps blocking while an upload is still going after the delete ends', () => {
    seedDelete('deleting');
    seedUploads('uploading');
    const { rerender } = renderHook(() => useUnloadGuard());

    seedDelete('completed');
    rerender();

    expect(unloadWasBlocked()).toBe(true);
  });
});

describe('when nothing is running', () => {
  it('lets the tab close', () => {
    renderHook(() => useUnloadGuard());

    expect(unloadWasBlocked()).toBe(false);
  });

  it.each<DeleteStatus>(['queued', 'completed', 'failed', 'cancelled'])(
    'does not block for a %s delete',
    (status) => {
      seedDelete(status);
      renderHook(() => useUnloadGuard());

      expect(unloadWasBlocked()).toBe(false);
    }
  );

  it('stops blocking once the delete finishes', () => {
    seedDelete('deleting');
    const { rerender } = renderHook(() => useUnloadGuard());
    expect(unloadWasBlocked()).toBe(true);

    seedDelete('completed');
    rerender();

    expect(unloadWasBlocked()).toBe(false);
  });

  it('detaches on unmount so later navigation is not prompted', () => {
    seedDelete('deleting');
    seedUploads('uploading');
    const { unmount } = renderHook(() => useUnloadGuard());

    unmount();

    expect(unloadWasBlocked()).toBe(false);
  });
});
