/**
 * Reading the folder again after being away. A laptop closed on the dashboard
 * and opened an hour later used to show the hour-old listing, with nothing to
 * say so.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDriveStore } from '@/context/data-context';
import { STALE_AFTER_MS, useRefreshOnReturn } from './use-refresh-on-return';

const refreshCurrentData = vi.fn(async () => {});
let visibility: DocumentVisibilityState = 'visible';
let online = true;

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  online = true;
  refreshCurrentData.mockClear();
  useDriveStore.setState({ refreshCurrentData });
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRefreshOnReturn', () => {
  it('reads the folder again, quietly, when the connection comes back', () => {
    renderHook(() => useRefreshOnReturn());

    window.dispatchEvent(new Event('online'));

    expect(refreshCurrentData).toHaveBeenCalledWith({ silent: true });
  });

  it('reads it again after the tab was hidden for a while', () => {
    renderHook(() => useRefreshOnReturn());

    setVisibility('hidden');
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1000);
    setVisibility('visible');

    expect(refreshCurrentData).toHaveBeenCalledTimes(1);
  });

  it('leaves it alone after a quick look at another tab', () => {
    renderHook(() => useRefreshOnReturn());

    setVisibility('hidden');
    vi.setSystemTime(Date.now() + 20_000);
    setVisibility('visible');

    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('notices the computer slept even when the page never reported being hidden', () => {
    renderHook(() => useRefreshOnReturn());

    // Timers stop while asleep: the next tick lands long after the last.
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 60_000);
    vi.advanceTimersByTime(30_000);

    expect(refreshCurrentData).toHaveBeenCalledTimes(1);
  });

  it('does not read on an ordinary tick', () => {
    renderHook(() => useRefreshOnReturn());

    vi.advanceTimersByTime(5 * 60_000);

    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('reads once when a return trips more than one check', () => {
    renderHook(() => useRefreshOnReturn());

    setVisibility('hidden');
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 60_000);
    setVisibility('visible');
    window.dispatchEvent(new Event('online'));

    expect(refreshCurrentData).toHaveBeenCalledTimes(1);
  });

  it('does not try while the browser is still offline', () => {
    online = false;
    renderHook(() => useRefreshOnReturn());

    setVisibility('hidden');
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1000);
    setVisibility('visible');

    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useRefreshOnReturn());
    unmount();

    window.dispatchEvent(new Event('online'));
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 60_000);
    vi.advanceTimersByTime(30_000);

    expect(refreshCurrentData).not.toHaveBeenCalled();
  });
});
