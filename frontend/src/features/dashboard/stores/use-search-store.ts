'use client';

import { create } from 'zustand';
import { SearchResult } from '@opndrive/s3-api';

/**
 * Cache entry for a search query
 */
interface SearchCacheEntry {
  query: string;
  prefix: string;
  results: SearchResult;
  timestamp: number;
  requestCount: number; // Track number of API requests made for this query
}

/**
 * Configuration for cache behavior
 */
const CACHE_CONFIG = {
  // Cache entries older than this will be considered stale (5 minutes)
  TTL_MS: 5 * 60 * 1000,
  // Maximum number of cached queries to keep in memory
  MAX_CACHE_SIZE: 20,
} as const;

/**
 * Search store state interface
 */
interface SearchStore {
  // Cache storage: Map for O(1) lookups
  searchCache: Map<string, SearchCacheEntry>;

  // Current active search state
  currentQuery: string | null;
  currentPrefix: string | null;
  isLoading: boolean;

  // Actions
  setSearchResults: (query: string, prefix: string, results: SearchResult) => void;
  setRequestCount: (query: string, prefix: string, count: number) => void;
  getRequestCount: (query: string, prefix: string) => number;
  getSearchResults: (query: string, prefix: string) => SearchCacheEntry | null;
  getCachedOrNull: (query: string, prefix: string) => SearchResult | null;
  setLoading: (loading: boolean) => void;
  setCurrentQuery: (query: string | null, prefix: string | null) => void;
  invalidateQuery: (query: string, prefix?: string) => void;
  invalidatePrefix: (prefix: string) => void;
  clearCache: () => void;
  cleanupStaleEntries: () => void;
}

/**
 * Generate a unique cache key from query and prefix
 */
const generateCacheKey = (query: string, prefix: string): string => {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedPrefix = prefix === '/' ? '' : prefix;
  return `${normalizedQuery}::${normalizedPrefix}`;
};

/**
 * Check if a cache entry is stale based on TTL
 */
const isEntryStale = (entry: SearchCacheEntry): boolean => {
  return Date.now() - entry.timestamp > CACHE_CONFIG.TTL_MS;
};

/**
 * Search store using Zustand
 * Provides persistent search results across components and routes
 */
export const useSearchStore = create<SearchStore>((set, get) => ({
  searchCache: new Map<string, SearchCacheEntry>(),
  currentQuery: null,
  currentPrefix: null,
  isLoading: false,

  /**
   * Store search results in cache
   */
  setSearchResults: (query: string, prefix: string, results: SearchResult) => {
    set((state) => {
      const newCache = new Map(state.searchCache);
      const cacheKey = generateCacheKey(query, prefix);

      // Get existing entry to preserve request count
      const existingEntry = newCache.get(cacheKey);

      // Add new entry, preserving the request count if it exists
      // If no existing entry, keep count at 0 (will be set by incrementRequestCount)
      newCache.set(cacheKey, {
        query: query.trim(),
        prefix,
        results,
        timestamp: Date.now(),
        requestCount: existingEntry?.requestCount ?? 0,
      });

      // Cleanup if cache size exceeds limit
      if (newCache.size > CACHE_CONFIG.MAX_CACHE_SIZE) {
        // Remove oldest entries
        const entries = Array.from(newCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

        const entriesToRemove = newCache.size - CACHE_CONFIG.MAX_CACHE_SIZE;
        for (let i = 0; i < entriesToRemove; i++) {
          newCache.delete(entries[i][0]);
        }
      }

      return { searchCache: newCache };
    });
  },

  /**
   * Get cached search results if available and not stale
   * Returns the full cache entry with metadata
   */
  getSearchResults: (query: string, prefix: string): SearchCacheEntry | null => {
    const cacheKey = generateCacheKey(query, prefix);
    const entry = get().searchCache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if entry is stale
    if (isEntryStale(entry)) {
      // Remove stale entry
      set((state) => {
        const newCache = new Map(state.searchCache);
        newCache.delete(cacheKey);
        return { searchCache: newCache };
      });
      return null;
    }

    return entry;
  },

  /**
   * Get cached results or null (convenience method)
   * Returns only the SearchResult, not the metadata
   */
  getCachedOrNull: (query: string, prefix: string): SearchResult | null => {
    const entry = get().getSearchResults(query, prefix);
    return entry ? entry.results : null;
  },

  /**
   * Set request count for a query (replaces incrementRequestCount)
   */
  setRequestCount: (query: string, prefix: string, count: number) => {
    set((state) => {
      const newCache = new Map(state.searchCache);
      const cacheKey = generateCacheKey(query, prefix);
      const entry = newCache.get(cacheKey);

      if (entry) {
        // Entry exists - update count
        newCache.set(cacheKey, {
          ...entry,
          requestCount: count,
        });
      } else {
        // Entry doesn't exist yet - create it with the count
        newCache.set(cacheKey, {
          query: query.trim(),
          prefix,
          results: {
            files: [],
            folders: [],
            totalFiles: 0,
            totalFolders: 0,
            totalKeys: 0,
            isTruncated: false,
          },
          timestamp: Date.now(),
          requestCount: count,
        });
      }

      return { searchCache: newCache };
    });
  },

  /**
   * Get request count for a query
   */
  getRequestCount: (query: string, prefix: string): number => {
    const cacheKey = generateCacheKey(query, prefix);
    const entry = get().searchCache.get(cacheKey);
    return entry?.requestCount || 0;
  },

  /**
   * Set loading state
   */
  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  /**
   * Set current active query
   */
  setCurrentQuery: (query: string | null, prefix: string | null) => {
    set({ currentQuery: query, currentPrefix: prefix });
  },

  /**
   * Invalidate a specific query (optionally for a specific prefix)
   */
  invalidateQuery: (query: string, prefix?: string) => {
    set((state) => {
      const newCache = new Map(state.searchCache);

      if (prefix !== undefined) {
        // Invalidate specific query + prefix combination
        const cacheKey = generateCacheKey(query, prefix);
        newCache.delete(cacheKey);
      } else {
        // Invalidate all entries with this query (across all prefixes)
        const normalizedQuery = query.trim().toLowerCase();
        for (const [key, entry] of newCache.entries()) {
          if (entry.query.toLowerCase() === normalizedQuery) {
            newCache.delete(key);
          }
        }
      }

      return { searchCache: newCache };
    });
  },

  /**
   * Invalidate all queries for a specific prefix
   * Useful when content in a folder changes
   */
  invalidatePrefix: (prefix: string) => {
    set((state) => {
      const newCache = new Map(state.searchCache);
      const normalizedPrefix = prefix === '/' ? '' : prefix;

      for (const [key, entry] of newCache.entries()) {
        if (entry.prefix === normalizedPrefix) {
          newCache.delete(key);
        }
      }

      return { searchCache: newCache };
    });
  },

  /**
   * Clear all cached search results
   */
  clearCache: () => {
    set({
      searchCache: new Map<string, SearchCacheEntry>(),
      currentQuery: null,
      currentPrefix: null,
    });
  },

  /**
   * Remove all stale entries from cache
   * Can be called periodically or on-demand
   */
  cleanupStaleEntries: () => {
    set((state) => {
      const newCache = new Map(state.searchCache);
      let removedCount = 0;

      for (const [key, entry] of newCache.entries()) {
        if (isEntryStale(entry)) {
          newCache.delete(key);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`[SearchStore] Cleaned up ${removedCount} stale cache entries`);
      }

      return { searchCache: newCache };
    });
  },
}));

/**
 * Hook to get cache statistics (useful for debugging)
 */
export const useSearchCacheStats = () => {
  const cache = useSearchStore((state) => state.searchCache);

  return {
    totalEntries: cache.size,
    staleEntries: Array.from(cache.values()).filter(isEntryStale).length,
    freshEntries: Array.from(cache.values()).filter((e) => !isEntryStale(e)).length,
  };
};

/**
 * Export cache configuration for external use
 */
export { CACHE_CONFIG };
