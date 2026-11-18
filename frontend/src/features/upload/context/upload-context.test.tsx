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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { StrictMode } from 'react';
import { render, act } from '@testing-library/react';

const managerRef: { current: unknown } = { current: null };
vi.mock('@/hooks/use-auth', () => ({
  useActiveUploadManager: () => managerRef.current,
}));

import { UploadProvider, useUploadExecutor } from './upload-context';
import { useUploadQueueStore, type PlannedUpload } from '../stores/use-upload-queue-store';
import { useUploadStore } from '../stores/use-upload-store';
import type { UploadExecutor } from '../services/upload-executor';
import { UPLOAD_EVENT_WINDOW_MS } from '../services/upload-event-batcher';

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

describe('card updates', () => {
  // Every store update copies every card and redraws the panel, so a drop of
  // thousands of files must not cost one update per manager event.
  const cards = ['u-0', 'u-1', 'u-2'];

  beforeEach(() => {
    useUploadStore.setState({
      uploads: Object.fromEntries(
        cards.map((id) => [
          id,
          { id, name: `${id}.txt`, type: 'file' as const, status: 'queued' as const, progress: 0 },
        ])
      ),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function countUpdates() {
    const counter = { updates: 0 };
    const unsubscribe = useUploadStore.subscribe(() => counter.updates++);
    return { counter, unsubscribe };
  }

  it("hands a burst of the manager's events to the store as one update", () => {
    mountProvider(false);
    vi.useFakeTimers();
    const { counter, unsubscribe } = countUpdates();

    act(() => {
      for (const id of cards) {
        manager.emit('statusChange', { id, status: 'uploading', progress: 0 });
        manager.emit('progress', { id, status: 'uploading', progress: 50 });
      }
      manager.emit('statusChange', { id: 'u-0', status: 'completed', progress: 100 });
    });
    expect(counter.updates).toBe(0);

    act(() => {
      vi.advanceTimersByTime(UPLOAD_EVENT_WINDOW_MS);
    });
    unsubscribe();

    expect(counter.updates).toBe(1);
    const { uploads } = useUploadStore.getState();
    expect(uploads['u-0']).toMatchObject({ status: 'completed', progress: 100 });
    expect(uploads['u-1']).toMatchObject({ status: 'uploading', progress: 50 });
    expect(uploads['u-2']).toMatchObject({ status: 'uploading', progress: 50 });
  });

  it('keeps the reason an upload failed, and drops it once it is tried again', () => {
    mountProvider(false);
    vi.useFakeTimers();

    act(() => {
      manager.emit('statusChange', {
        id: 'u-0',
        status: 'failed',
        progress: 40,
        error: 'Access Denied',
      });
      vi.advanceTimersByTime(UPLOAD_EVENT_WINDOW_MS);
    });
    expect(useUploadStore.getState().uploads['u-0']).toMatchObject({
      status: 'failed',
      error: 'Access Denied',
    });

    // Retried: the reason was about the attempt that failed.
    act(() => {
      manager.emit('statusChange', { id: 'u-0', status: 'queued', progress: 0 });
      vi.advanceTimersByTime(UPLOAD_EVENT_WINDOW_MS);
    });
    expect(useUploadStore.getState().uploads['u-0']!.error).toBeUndefined();
  });

  it('still delivers the last window when the provider goes away', () => {
    const { unmount } = mountProvider(false);
    vi.useFakeTimers();

    act(() => {
      manager.emit('statusChange', { id: 'u-1', status: 'cancelled', progress: 0 });
    });
    unmount();

    // Not waiting on the timer: the provider is gone, and the batch with it.
    expect(useUploadStore.getState().uploads['u-1']!.status).toBe('cancelled');
  });
});
