/**
 * Search store: a TTL cache of search results keyed by query + prefix.
 *
 * Two things drive most of the behaviour and both are easy to get wrong:
 *
 *  - The cache key is normalised. `  Report ` and `report` are the same query,
 *    and prefix `/` means the same place as `''`. Without that, the same search
 *    typed slightly differently re-hits S3.
 *  - Entries expire after 5 minutes, and reads are what evict them.
 *
 * Time is faked throughout so the TTL is exercised deterministically rather
 * than by waiting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SearchResult } from '@opndrive/s3-api';
import { useSearchStore, CACHE_CONFIG } from './use-search-store';

const store = () => useSearchStore.getState();

function results(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    files: [],
    folders: [],
    totalFiles: 0,
    totalFolders: 0,
    totalKeys: 0,
    isTruncated: false,
    ...overrides,
  } as SearchResult;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 1));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('storing and reading results', () => {
  it('round-trips a result', () => {
    const payload = results({ totalFiles: 3 });

    store().setSearchResults('report', 'docs/', payload);

    expect(store().getCachedOrNull('report', 'docs/')).toBe(payload);
  });

  it('returns null for a query it has never seen', () => {
    expect(store().getCachedOrNull('nothing', 'docs/')).toBeNull();
    expect(store().getSearchResults('nothing', 'docs/')).toBeNull();
  });

  it('records the query and prefix alongside the results', () => {
    store().setSearchResults('  Report  ', 'docs/', results());

    const entry = store().getSearchResults('report', 'docs/')!;
    // The stored query is trimmed but keeps its original casing for display.
    expect(entry).toMatchObject({ query: 'Report', prefix: 'docs/', requestCount: 0 });
    expect(entry.timestamp).toBe(Date.now());
  });

  it('overwrites the entry for a repeated search', () => {
    store().setSearchResults('report', 'docs/', results({ totalFiles: 1 }));
    store().setSearchResults('report', 'docs/', results({ totalFiles: 9 }));

    expect(store().searchCache.size).toBe(1);
    expect(store().getCachedOrNull('report', 'docs/')!.totalFiles).toBe(9);
  });
});

describe('cache key normalisation', () => {
  it('ignores surrounding whitespace and casing', () => {
    store().setSearchResults('Report', 'docs/', results({ totalFiles: 4 }));

    // Retyping the same search slightly differently must not re-hit S3.
    expect(store().getCachedOrNull('  report  ', 'docs/')!.totalFiles).toBe(4);
    expect(store().getCachedOrNull('REPORT', 'docs/')!.totalFiles).toBe(4);
  });

  it('treats a root prefix of "/" the same as empty', () => {
    store().setSearchResults('report', '/', results({ totalFiles: 2 }));

    expect(store().getCachedOrNull('report', '')!.totalFiles).toBe(2);
  });

  it('keeps different prefixes apart', () => {
    store().setSearchResults('report', 'docs/', results({ totalFiles: 1 }));
    store().setSearchResults('report', 'photos/', results({ totalFiles: 7 }));

    expect(store().searchCache.size).toBe(2);
    expect(store().getCachedOrNull('report', 'docs/')!.totalFiles).toBe(1);
    expect(store().getCachedOrNull('report', 'photos/')!.totalFiles).toBe(7);
  });

  it('does not confuse queries that differ only inside the string', () => {
    store().setSearchResults('re port', 'docs/', results({ totalFiles: 1 }));

    expect(store().getCachedOrNull('report', 'docs/')).toBeNull();
  });
});

describe('expiry', () => {
  it('serves an entry that is still inside the TTL', () => {
    store().setSearchResults('report', 'docs/', results({ totalFiles: 5 }));

    vi.advanceTimersByTime(CACHE_CONFIG.TTL_MS - 1);

    expect(store().getCachedOrNull('report', 'docs/')!.totalFiles).toBe(5);
  });

  it('discards an entry once the TTL has passed', () => {
    store().setSearchResults('report', 'docs/', results());

    vi.advanceTimersByTime(CACHE_CONFIG.TTL_MS + 1);

    expect(store().getCachedOrNull('report', 'docs/')).toBeNull();
  });

  it('evicts the stale entry rather than just hiding it', () => {
    store().setSearchResults('report', 'docs/', results());
    vi.advanceTimersByTime(CACHE_CONFIG.TTL_MS + 1);

    store().getSearchResults('report', 'docs/');

    // Reading is what prunes it; leaving it would keep the entry counting
    // towards the size cap forever.
    expect(store().searchCache.size).toBe(0);
  });

  it('sweeps every stale entry on demand, keeping the fresh ones', () => {
    store().setSearchResults('old-1', 'docs/', results());
    store().setSearchResults('old-2', 'docs/', results());
    vi.advanceTimersByTime(CACHE_CONFIG.TTL_MS + 1);
    store().setSearchResults('fresh', 'docs/', results());

    store().cleanupStaleEntries();

    expect([...store().searchCache.values()].map((e) => e.query)).toEqual(['fresh']);
  });

  it('leaves a fresh cache untouched when swept', () => {
    store().setSearchResults('a', 'docs/', results());
    store().setSearchResults('b', 'docs/', results());

    store().cleanupStaleEntries();

    expect(store().searchCache.size).toBe(2);
  });
});

describe('size cap', () => {
  it('holds exactly the maximum without evicting', () => {
    for (let i = 0; i < CACHE_CONFIG.MAX_CACHE_SIZE; i++) {
      store().setSearchResults(`q${i}`, 'docs/', results());
    }

    expect(store().searchCache.size).toBe(CACHE_CONFIG.MAX_CACHE_SIZE);
  });

  it('drops the oldest entry when the cap is exceeded', () => {
    for (let i = 0; i < CACHE_CONFIG.MAX_CACHE_SIZE; i++) {
      store().setSearchResults(`q${i}`, 'docs/', results());
      vi.advanceTimersByTime(10); // distinct timestamps, so "oldest" is unambiguous
    }

    store().setSearchResults('newest', 'docs/', results());

    expect(store().searchCache.size).toBe(CACHE_CONFIG.MAX_CACHE_SIZE);
    expect(store().getCachedOrNull('q0', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('newest', 'docs/')).not.toBeNull();
  });

  it('keeps the most recent searches', () => {
    for (let i = 0; i < CACHE_CONFIG.MAX_CACHE_SIZE + 3; i++) {
      store().setSearchResults(`q${i}`, 'docs/', results());
      vi.advanceTimersByTime(10);
    }

    // The three oldest go; everything newer survives.
    expect(store().getCachedOrNull('q0', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('q2', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('q3', 'docs/')).not.toBeNull();
  });
});

describe('request counting', () => {
  it('starts a new entry at zero', () => {
    store().setSearchResults('report', 'docs/', results());

    expect(store().getRequestCount('report', 'docs/')).toBe(0);
  });

  it('reports zero for an unknown query', () => {
    expect(store().getRequestCount('never', 'docs/')).toBe(0);
  });

  it('records a count against an existing entry', () => {
    store().setSearchResults('report', 'docs/', results());

    store().setRequestCount('report', 'docs/', 4);

    expect(store().getRequestCount('report', 'docs/')).toBe(4);
  });

  it('creates a placeholder entry when the count arrives first', () => {
    // The service reports request counts while paging, before any results land.
    store().setRequestCount('report', 'docs/', 2);

    expect(store().getRequestCount('report', 'docs/')).toBe(2);
    expect(store().getCachedOrNull('report', 'docs/')).toMatchObject({
      files: [],
      folders: [],
      totalKeys: 0,
    });
  });

  it('survives the results arriving afterwards', () => {
    store().setRequestCount('report', 'docs/', 3);

    store().setSearchResults('report', 'docs/', results({ totalFiles: 8 }));

    // Losing the count here would reset the "searched N folders" indicator to
    // zero the moment results appeared.
    expect(store().getRequestCount('report', 'docs/')).toBe(3);
    expect(store().getCachedOrNull('report', 'docs/')!.totalFiles).toBe(8);
  });

  it('normalises the key the same way as the rest of the cache', () => {
    store().setRequestCount('  Report ', 'docs/', 5);

    expect(store().getRequestCount('report', 'docs/')).toBe(5);
  });
});

describe('invalidation', () => {
  beforeEach(() => {
    store().setSearchResults('report', 'docs/', results());
    store().setSearchResults('report', 'photos/', results());
    store().setSearchResults('budget', 'docs/', results());
  });

  it('drops one query in one prefix when both are given', () => {
    store().invalidateQuery('report', 'docs/');

    expect(store().getCachedOrNull('report', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('report', 'photos/')).not.toBeNull();
  });

  it('drops a query across every prefix when no prefix is given', () => {
    store().invalidateQuery('report');

    expect(store().getCachedOrNull('report', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('report', 'photos/')).toBeNull();
    expect(store().getCachedOrNull('budget', 'docs/')).not.toBeNull();
  });

  it('matches the query case-insensitively when invalidating everywhere', () => {
    store().invalidateQuery('REPORT');

    expect(store().getCachedOrNull('report', 'docs/')).toBeNull();
  });

  it('drops every query for a prefix whose contents changed', () => {
    store().invalidatePrefix('docs/');

    // Uploading into docs/ makes every cached search of docs/ wrong.
    expect(store().getCachedOrNull('report', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('budget', 'docs/')).toBeNull();
    expect(store().getCachedOrNull('report', 'photos/')).not.toBeNull();
  });

  it('normalises "/" when invalidating a prefix', () => {
    store().setSearchResults('root-search', '', results());

    store().invalidatePrefix('/');

    expect(store().getCachedOrNull('root-search', '')).toBeNull();
  });

  it('is a no-op for a prefix with nothing cached', () => {
    store().invalidatePrefix('elsewhere/');

    expect(store().searchCache.size).toBe(3);
  });
});

describe('active query and loading', () => {
  it('tracks the query being viewed', () => {
    store().setCurrentQuery('report', 'docs/');

    expect(store().currentQuery).toBe('report');
    expect(store().currentPrefix).toBe('docs/');
  });

  it('clears the active query', () => {
    store().setCurrentQuery('report', 'docs/');

    store().setCurrentQuery(null, null);

    expect(store().currentQuery).toBeNull();
    expect(store().currentPrefix).toBeNull();
  });

  it('toggles the loading flag', () => {
    expect(store().isLoading).toBe(false);

    store().setLoading(true);
    expect(store().isLoading).toBe(true);

    store().setLoading(false);
    expect(store().isLoading).toBe(false);
  });
});

describe('clearCache', () => {
  it('empties the cache and forgets the active query', () => {
    store().setSearchResults('report', 'docs/', results());
    store().setCurrentQuery('report', 'docs/');

    store().clearCache();

    expect(store().searchCache.size).toBe(0);
    expect(store().currentQuery).toBeNull();
    expect(store().currentPrefix).toBeNull();
  });

  it('leaves the loading flag alone', () => {
    store().setLoading(true);

    store().clearCache();

    // A search in flight is still in flight; clearing results does not cancel
    // it, and lying about that would strand the spinner.
    expect(store().isLoading).toBe(true);
  });
});
