import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearch } from './use-search';
import { createSearchService } from '@/features/dashboard/services/search-service';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';

/**
 * Regression tests for #82.
 *
 * Two separate defects were reported in that issue:
 *  1. useSearch early-returned a stub object before declaring four
 *     useCallbacks whenever apiS3 was null, so the hook count changed between
 *     renders of the SAME mounted instance and React threw.
 *  2. createSearchService(apiS3) ran on every render and sat in the `search`
 *     callback's own dependency array, so `search` was rebuilt every render
 *     and the memoisation did nothing.
 *
 * Defect 2 never crashes, so it is only caught by asserting identity - hence
 * the stability tests below, not just the no-throw ones.
 */

const mockUseAuthGuard = vi.fn();

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => mockUseAuthGuard(),
}));

// These two mocks MUST return the same references on every call. The real
// providers do (their callbacks are useCallback-wrapped with stable deps), and
// they feed `search`'s dependency array - so a mock that minted a fresh
// function per render would make the memoisation assertions below fail for a
// reason that does not exist in production.
vi.mock('@/context/notification-context', () => {
  const stable = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
  return { useNotification: () => stable };
});

vi.mock('@/context/data-context', () => {
  const stable = { currentPrefix: '/' };
  return { useDriveStore: () => stable };
});

vi.mock('@/features/dashboard/services/search-service', () => ({
  createSearchService: vi.fn(() => ({ search: vi.fn(async () => ({})) })),
}));

const mockedCreateSearchService = vi.mocked(createSearchService);

/** Distinct object identities standing in for two different S3 providers. */
const providerA = { id: 'A' } as never;
const providerB = { id: 'B' } as never;

describe('useSearch - Rules of Hooks (#82 defect 1)', () => {
  beforeEach(() => {
    mockUseAuthGuard.mockReset();
    // mockReset, not mockClear: two tests below install a persistent return
    // value with mockReturnValue, and mockClear only wipes call history. That
    // stale value survived into other suites, so both providers received the
    // same service object and the memoisation assertions silently passed or
    // failed depending on test order. mockReset also restores the factory
    // implementation given to vi.fn().
    mockedCreateSearchService.mockReset();
  });

  it('does not throw when apiS3 goes null -> provider on a mounted instance', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: null });
    const { result, rerender } = renderHook(() => useSearch());

    expect(typeof result.current.search).toBe('function');

    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });

    expect(() => rerender()).not.toThrow();
    expect(typeof result.current.search).toBe('function');
  });

  it('does not throw when apiS3 goes provider -> null (logout) on a mounted instance', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    const { result, rerender } = renderHook(() => useSearch());

    expect(typeof result.current.search).toBe('function');

    mockUseAuthGuard.mockReturnValue({ apiS3: null });

    expect(() => rerender()).not.toThrow();
    expect(typeof result.current.search).toBe('function');
  });
});

describe('useSearch - service memoisation (#82 defect 2)', () => {
  beforeEach(() => {
    mockUseAuthGuard.mockReset();
    // mockReset, not mockClear: two tests below install a persistent return
    // value with mockReturnValue, and mockClear only wipes call history. That
    // stale value survived into other suites, so both providers received the
    // same service object and the memoisation assertions silently passed or
    // failed depending on test order. mockReset also restores the factory
    // implementation given to vi.fn().
    mockedCreateSearchService.mockReset();
  });

  it('builds the search service once across re-renders with an unchanged apiS3', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    const { rerender } = renderHook(() => useSearch());

    rerender();
    rerender();

    expect(mockedCreateSearchService).toHaveBeenCalledTimes(1);
  });

  it('keeps the `search` callback identity stable across re-renders', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    const { result, rerender } = renderHook(() => useSearch());

    const first = result.current.search;
    rerender();
    rerender();

    expect(result.current.search).toBe(first);
  });

  it('rebuilds the service when apiS3 changes identity (bucket switch)', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    const { result, rerender } = renderHook(() => useSearch());

    const first = result.current.search;
    expect(mockedCreateSearchService).toHaveBeenCalledTimes(1);

    mockUseAuthGuard.mockReturnValue({ apiS3: providerB });
    rerender();

    expect(mockedCreateSearchService).toHaveBeenCalledTimes(2);
    expect(mockedCreateSearchService).toHaveBeenLastCalledWith(providerB);
    // A stale `search` here would keep querying the previous bucket.
    expect(result.current.search).not.toBe(first);
  });
});

describe('useSearch - readiness and inert behaviour', () => {
  beforeEach(() => {
    mockUseAuthGuard.mockReset();
    // mockReset, not mockClear: two tests below install a persistent return
    // value with mockReturnValue, and mockClear only wipes call history. That
    // stale value survived into other suites, so both providers received the
    // same service object and the memoisation assertions silently passed or
    // failed depending on test order. mockReset also restores the factory
    // implementation given to vi.fn().
    mockedCreateSearchService.mockReset();
    useSearchStore.getState().clearCache();
    useSearchStore.getState().setLoading(false);
  });

  it('reports isReady false with no provider and true once one exists', () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: null });
    const { result, rerender } = renderHook(() => useSearch());

    expect(result.current.isReady).toBe(false);

    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    rerender();

    expect(result.current.isReady).toBe(true);
  });

  it('does not touch shared store state when searching without a provider', async () => {
    mockUseAuthGuard.mockReturnValue({ apiS3: null });
    const { result } = renderHook(() => useSearch());

    // Counting store transitions rather than inspecting the final state, on
    // purpose. Without the guard, search() runs on into the body, flips
    // isLoading and currentQuery, then throws on the null service - and the
    // catch block resets currentQuery to null while `finally` clears the
    // loading flag. The end state is therefore identical either way, so
    // asserting on it proves nothing. Only the transitions distinguish
    // "never ran" from "ran and blew up".
    let storeTransitions = 0;
    const unsubscribe = useSearchStore.subscribe(() => {
      storeTransitions += 1;
    });

    await act(async () => {
      await result.current.search('anything');
    });

    unsubscribe();

    expect(storeTransitions).toBe(0);
    expect(useSearchStore.getState().currentQuery).toBeNull();
    expect(useSearchStore.getState().isLoading).toBe(false);
    expect(result.current.searchResults).toBeNull();
  });
});

describe('useSearch - in-flight search cleanup', () => {
  beforeEach(() => {
    mockUseAuthGuard.mockReset();
    // mockReset, not mockClear: two tests below install a persistent return
    // value with mockReturnValue, and mockClear only wipes call history. That
    // stale value survived into other suites, so both providers received the
    // same service object and the memoisation assertions silently passed or
    // failed depending on test order. mockReset also restores the factory
    // implementation given to vi.fn().
    mockedCreateSearchService.mockReset();
    useSearchStore.getState().clearCache();
    useSearchStore.getState().setLoading(false);
  });

  it('does not let a superseded search tear down the one that replaced it', async () => {
    const started: { signal?: AbortSignal }[] = [];

    mockedCreateSearchService.mockReturnValue({
      search: vi.fn((_q: string, _p: string, _t: unknown, opts: { signal?: AbortSignal }) => {
        started.push({ signal: opts.signal });
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new Error('Search cancelled')));
        });
      }),
    } as never);

    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    const { result } = renderHook(() => useSearch());

    // First search, then a second one that supersedes it. The second aborts
    // the first, whose rejection then settles *after* the second is already
    // the current search.
    await act(async () => {
      void result.current.search('first');
    });
    await act(async () => {
      void result.current.search('second');
    });

    expect(started).toHaveLength(2);
    expect(started[0].signal?.aborted).toBe(true);
    expect(started[1].signal?.aborted).toBe(false);

    // The superseded search's `finally` must not clear shared state, or the
    // spinner disappears while the second search is still running...
    expect(useSearchStore.getState().isLoading).toBe(true);

    // ...and the Cancel button, which acts on the stored controller, goes dead.
    act(() => {
      result.current.cancelSearch();
    });
    expect(started[1].signal?.aborted).toBe(true);
  });

  it('aborts an in-flight search on unmount and clears the shared loading flag', async () => {
    let capturedSignal: AbortSignal | undefined;
    let releaseSearch: (() => void) | undefined;

    mockedCreateSearchService.mockReturnValue({
      search: vi.fn((_q: string, _p: string, _t: unknown, opts: { signal?: AbortSignal }) => {
        capturedSignal = opts.signal;
        // Never settles until the test says so - this is what keeps a search
        // "in flight" while the component unmounts underneath it.
        return new Promise((resolve) => {
          releaseSearch = () => resolve({ files: [], folders: [] });
        });
      }),
    } as never);

    mockUseAuthGuard.mockReturnValue({ apiS3: providerA });
    const { result, unmount } = renderHook(() => useSearch());

    act(() => {
      void result.current.search('in-flight');
    });

    expect(capturedSignal?.aborted).toBe(false);
    expect(useSearchStore.getState().isLoading).toBe(true);

    unmount();

    // Without the cleanup the service keeps paginating for a component that
    // no longer exists, and isLoading - which lives in a module-level store
    // that outlives the component - stays true forever, stranding the next
    // mount on a permanent spinner.
    expect(capturedSignal?.aborted).toBe(true);
    expect(useSearchStore.getState().isLoading).toBe(false);

    releaseSearch?.();
  });
});
