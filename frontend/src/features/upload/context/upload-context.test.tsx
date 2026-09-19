/**
 * UploadProvider.
 *
 * Hosting the executor here looks trivial and is not. Creating it in a
 * `useMemo` - the obvious way - subscribes to the manager DURING RENDER, and
 * under StrictMode React runs the factory twice and then simulates an
 * unmount/remount. The result was an executor that consumers still held but
 * that had been disposed: it received no events, so claims were never
 * committed and never released, silently, in dev only.
 *
 * These tests exist to make that specific failure loud.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { StrictMode } from 'react';
import { render, act } from '@testing-library/react';

const managerRef: { current: unknown } = { current: null };
vi.mock('@/hooks/use-auth', () => ({
  useActiveUploadManager: () => managerRef.current,
}));

import { UploadProvider, useUploadExecutor } from './upload-context';
import { useUploadStore } from '../stores/use-upload-store';
import { useUploadQueueStore, type PlannedUpload } from '../stores/use-upload-queue-store';
import type { UploadExecutor } from '../services/upload-executor';

function fakeManager() {
  const listeners: Record<string, ((p: unknown) => void)[]> = { progress: [], statusChange: [] };
  let n = 0;
  return {
    addUpload: () => `u-${n++}`,
    cancelUpload: vi.fn(),
    on(event: string, fn: (p: unknown) => void) {
      listeners[event]!.push(fn);
    },
    off(event: string, fn: (p: unknown) => void) {
      listeners[event] = listeners[event]!.filter((l) => l !== fn);
    },
    emit(event: string, payload: unknown) {
      for (const fn of [...listeners[event]!]) fn(payload);
    },
    liveListeners: () => listeners.progress!.length + listeners.statusChange!.length,
  };
}

function plan(): PlannedUpload {
  return {
    id: 'task-1',
    kind: 'folder',
    originalName: 'photos',
    resolvedName: 'photos',
    prefix: 'photos/',
    verification: 'confirmed',
    files: [new File([new Uint8Array(4)], 'a.jpg')],
    totalBytes: 4,
  };
}

/** Renders the provider and hands back whatever executor consumers would get. */
function mountProvider(strict: boolean) {
  let captured: UploadExecutor | null = null;
  const Consumer: React.FC = () => {
    captured = useUploadExecutor();
    return null;
  };

  const tree = (
    <UploadProvider>
      <Consumer />
    </UploadProvider>
  );

  const utils = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { ...utils, executor: () => captured as UploadExecutor | null };
}

/** Dispatches one task and lands a byte on it; returns whether the claim committed. */
function commitsOnProgress(executor: UploadExecutor, manager: ReturnType<typeof fakeManager>) {
  useUploadQueueStore.getState().reservePrefix('photos', '', 'task-1');
  act(() => {
    executor.start([plan()]);
  });
  act(() => {
    manager.emit('progress', { id: 'u-0', status: 'uploading', progress: 25 });
  });
  return useUploadQueueStore.getState().claims[0]?.committed ?? false;
}

let manager: ReturnType<typeof fakeManager>;

beforeEach(() => {
  manager = fakeManager();
  managerRef.current = manager;
});

describe('executor lifecycle', () => {
  it('hands out a live executor under StrictMode', () => {
    // The regression: consumers got an executor React had already disposed.
    const { executor } = mountProvider(true);

    expect(executor()).not.toBeNull();
    expect(commitsOnProgress(executor()!, manager)).toBe(true);
  });

  it('hands out a live executor without StrictMode', () => {
    const { executor } = mountProvider(false);

    expect(commitsOnProgress(executor()!, manager)).toBe(true);
  });

  it('leaves no listeners behind on unmount', () => {
    const { unmount } = mountProvider(true);
    expect(manager.liveListeners()).toBeGreaterThan(0);

    unmount();

    expect(manager.liveListeners()).toBe(0);
  });

  it('unsubscribes the old manager when the bucket changes', () => {
    // Switching bucket or upload mode builds a new manager. The old one must
    // stop being listened to, or events from a torn-down session keep landing.
    const { rerender, executor } = mountProvider(false);
    const first = manager;
    expect(first.liveListeners()).toBeGreaterThan(0);

    const second = fakeManager();
    managerRef.current = second;
    act(() => {
      rerender(
        <UploadProvider>
          <div />
        </UploadProvider>
      );
    });

    expect(first.liveListeners()).toBe(0);
    expect(second.liveListeners()).toBeGreaterThan(0);
    expect(executor).toBeTruthy();
  });

  it('reports no executor before a session exists', () => {
    managerRef.current = null;

    const { executor } = mountProvider(false);

    expect(executor()).toBeNull();
  });
});

describe('manager events into the store', () => {
  /** One queued card per id, so the store has something to update. */
  const seedUploads = (count: number) => {
    const { addUpload } = useUploadStore.getState();
    for (let i = 0; i < count; i++) {
      addUpload(`u-${i}`, {
        id: `u-${i}`,
        name: `f${i}.txt`,
        status: 'queued',
        progress: 0,
        type: 'file',
      });
    }
  };

  beforeEach(() => {
    useUploadStore.setState({ uploads: {} });
  });

  it('writes one batch for a burst of events', async () => {
    mountProvider(false);
    seedUploads(50);

    let writes = 0;
    const stop = useUploadStore.subscribe(() => {
      writes++;
    });

    // What cancelling a folder looks like from here: every file reporting in,
    // one after another, inside a single tick.
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        manager.emit('statusChange', { id: `u-${i}`, status: 'cancelled', progress: 0 });
      }
    });
    stop();

    // Fifty separate writes each copied the whole uploads record and woke every
    // subscriber. That is the quadratic cost that froze the tab.
    expect(writes).toBe(1);
    expect(
      Object.values(useUploadStore.getState().uploads).every((u) => u.status === 'cancelled')
    ).toBe(true);
  });

  it('keeps only the last state a file reported in a tick', async () => {
    mountProvider(false);
    seedUploads(1);

    await act(async () => {
      manager.emit('statusChange', { id: 'u-0', status: 'uploading', progress: 0 });
      manager.emit('progress', { id: 'u-0', status: 'uploading', progress: 60 });
      manager.emit('statusChange', { id: 'u-0', status: 'completed', progress: 100 });
    });

    const upload = useUploadStore.getState().uploads['u-0']!;
    expect(upload.status).toBe('completed');
    expect(upload.progress).toBe(100);
  });

  it('writes what is still buffered when the manager goes away', () => {
    const { unmount } = mountProvider(false);
    seedUploads(1);

    // No tick between the event and the teardown, which is what disposing the
    // managers on logout does. Dropping it would leave the card at 'uploading'
    // with nothing left to move it.
    act(() => {
      manager.emit('statusChange', { id: 'u-0', status: 'cancelled', progress: 0 });
      unmount();
    });

    expect(useUploadStore.getState().uploads['u-0']!.status).toBe('cancelled');
  });
});
