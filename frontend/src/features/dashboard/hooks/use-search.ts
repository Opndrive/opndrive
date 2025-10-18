import { useCallback, useRef, useEffect } from 'react';
import { createSearchService } from '@/features/dashboard/services/search-service';
import { useNotification } from '@/context/notification-context';
import { useDriveStore } from '@/context/data-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';

export const useSearch = () => {
  const { error } = useNotification();
  const { currentPrefix } = useDriveStore();
  const { apiS3 } = useAuthGuard();

  // AbortController for cancelling searches
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use Zustand store instead of local state
  const {
    setSearchResults: setCachedSearchResults,
    getCachedOrNull,
    setLoading,
    setCurrentQuery,
    invalidateQuery,
    setRequestCount,
  } = useSearchStore();

  // Subscribe to store state changes using Zustand selectors
  // These will trigger re-renders when the store updates
  const isLoading = useSearchStore((state) => state.isLoading);
  const currentQuery = useSearchStore((state) => state.currentQuery);
  const currentCachedPrefix = useSearchStore((state) => state.currentPrefix);

  // Use a selector to compute searchResults reactively
  // This will cause components to re-render when cache updates
  const searchResults = useSearchStore((state) => {
    if (!state.currentQuery || state.currentPrefix === null) return null;

    // Read directly from the cache to trigger re-renders on updates
    const cacheKey = `${state.currentQuery.trim().toLowerCase()}::${state.currentPrefix === '/' ? '' : state.currentPrefix}`;
    const entry = state.searchCache.get(cacheKey);

    if (!entry) return null;

    // Check if entry is stale (5 minutes)
    const isStale = Date.now() - entry.timestamp > 5 * 60 * 1000;
    if (isStale) return null;

    return entry.results;
  });

  // Get request count for current query
  const requestCount = useSearchStore((state) => {
    if (!state.currentQuery || state.currentPrefix === null) return 0;

    const cacheKey = `${state.currentQuery.trim().toLowerCase()}::${state.currentPrefix === '/' ? '' : state.currentPrefix}`;
    const entry = state.searchCache.get(cacheKey);

    return entry?.requestCount || 0;
  });

  // Ref to access latest search results without causing re-renders in callbacks
  const searchResultsRef = useRef(searchResults);

  // Update ref when searchResults change
  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);

  if (!apiS3) {
    return {
      search: async () => {},
      clearResults: () => {},
      invalidateCurrentQuery: () => {},
      cancelSearch: () => {},
      isLoading: false,
      searchResults: null,
      hasResults: false,
      canLoadMore: false,
    };
  }

  const searchService = createSearchService(apiS3);

  /**
   * Cancel the current search operation
   */
  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      console.log('[useSearch] Search cancelled by user');
    }
  }, [setLoading]);

  /**
   * Universal search function with automatic caching and pagination support
   * @param query - Search query string
   * @param nextToken - Optional token for fetching more results (API-level pagination)
   * @param forceRefresh - Force bypass cache and fetch fresh results
   */
  const search = useCallback(
    async (query: string, nextToken?: string, forceRefresh = false) => {
      if (!query.trim()) {
        setCurrentQuery(null, null);
        return;
      }

      const normalizedPrefix = currentPrefix === '/' ? '' : currentPrefix || '';

      // Check cache only for initial search (no nextToken) and no force refresh
      if (!nextToken && !forceRefresh) {
        const cachedResults = getCachedOrNull(query, normalizedPrefix);
        if (cachedResults) {
          // Cache hit - use cached results
          setCurrentQuery(query, normalizedPrefix);
          console.log(
            `[useSearch] Cache hit for query: "${query}" in prefix: "${normalizedPrefix}"`
          );
          return;
        }
      }

      // Cancel any existing search
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this search
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Fetch from API
      setLoading(true);
      setCurrentQuery(query, normalizedPrefix);

      // Capture the starting count BEFORE the search begins
      const startingCount = useSearchStore.getState().getRequestCount(query, normalizedPrefix);
      console.log(
        `[useSearch] Starting search with base count: ${startingCount}, nextToken: ${nextToken ? 'yes' : 'no'}`
      );

      try {
        const results = await searchService.search(query, normalizedPrefix, nextToken, {
          signal,
          onProgress: (progress) => {
            if (progress.status === 'error') {
              error('Search failed');
            }
          },
          onError: (errorMessage) => {
            error(errorMessage);
          },
          onRequestCountUpdate: (sessionCount) => {
            // Session count is the number of API calls in THIS search session
            // Add it to the starting count to get the cumulative total
            const totalCount = startingCount + sessionCount;
            console.log(
              `[useSearch] Request count update: session=${sessionCount}, starting=${startingCount}, total=${totalCount}`
            );
            setRequestCount(query, normalizedPrefix, totalCount);
          },
          onResultsUpdate: (partialResults) => {
            // Stream results as they come in
            if (nextToken && searchResultsRef.current) {
              // Merge with existing results for pagination
              const seenFiles = new Set<string>(
                searchResultsRef.current.files.map((f) => (f.Key ? String(f.Key) : ''))
              );
              const dedupedNewFiles = partialResults.files.filter((f) => {
                const k = f.Key ? String(f.Key) : '';
                if (!k || seenFiles.has(k)) return false;
                seenFiles.add(k);
                return true;
              });

              const seenFolders = new Set<string>(
                searchResultsRef.current.folders.map((f) => (f.Key ? String(f.Key) : ''))
              );
              const dedupedNewFolders = partialResults.folders.filter((f) => {
                const k = f.Key ? String(f.Key) : '';
                if (!k || seenFolders.has(k)) return false;
                seenFolders.add(k);
                return true;
              });

              const updatedResults = {
                files: [...searchResultsRef.current.files, ...dedupedNewFiles],
                totalFiles: searchResultsRef.current.totalFiles + dedupedNewFiles.length,
                folders: [...searchResultsRef.current.folders, ...dedupedNewFolders],
                totalFolders: searchResultsRef.current.totalFolders + dedupedNewFolders.length,
                totalKeys:
                  searchResultsRef.current.totalKeys +
                  dedupedNewFiles.length +
                  dedupedNewFolders.length,
                nextToken: partialResults.nextToken,
                isTruncated: partialResults.isTruncated,
              };
              setCachedSearchResults(query, normalizedPrefix, updatedResults);
            } else {
              // Initial search - replace results
              setCachedSearchResults(query, normalizedPrefix, partialResults);
            }
            console.log(
              `[useSearch] Streamed ${partialResults.totalKeys} results (${partialResults.totalFiles} files, ${partialResults.totalFolders} folders)`
            );
          },
        });

        // Store/merge final results in cache
        if (nextToken && searchResultsRef.current) {
          // Append new results to existing ones with de-duplication
          const seenFiles = new Set<string>(
            searchResultsRef.current.files.map((f) => (f.Key ? String(f.Key) : ''))
          );
          const dedupedNewFiles = results.files.filter((f) => {
            const k = f.Key ? String(f.Key) : '';
            if (!k || seenFiles.has(k)) return false;
            seenFiles.add(k);
            return true;
          });

          const seenFolders = new Set<string>(
            searchResultsRef.current.folders.map((f) => (f.Key ? String(f.Key) : ''))
          );
          const dedupedNewFolders = results.folders.filter((f) => {
            const k = f.Key ? String(f.Key) : '';
            if (!k || seenFolders.has(k)) return false;
            seenFolders.add(k);
            return true;
          });

          const updatedResults = {
            files: [...searchResultsRef.current.files, ...dedupedNewFiles],
            totalFiles: searchResultsRef.current.totalFiles + dedupedNewFiles.length,
            folders: [...searchResultsRef.current.folders, ...dedupedNewFolders],
            totalFolders: searchResultsRef.current.totalFolders + dedupedNewFolders.length,
            totalKeys:
              searchResultsRef.current.totalKeys +
              dedupedNewFiles.length +
              dedupedNewFolders.length,
            nextToken: results.nextToken,
            isTruncated: results.isTruncated,
          };
          setCachedSearchResults(query, normalizedPrefix, updatedResults);
        } else {
          // Initial search or force refresh
          setCachedSearchResults(query, normalizedPrefix, results);
        }

        console.log(
          `[useSearch] ${nextToken ? 'Fetched more' : 'Completed search with'} ${results.totalKeys} results (${results.totalFiles} files, ${results.totalFolders} folders) for query: "${query}"`
        );
      } catch (err) {
        // Don't show error if search was cancelled
        if (err instanceof Error && err.message === 'Search cancelled') {
          console.log('[useSearch] Search was cancelled');
          return;
        }

        error(`Failed to search for "${query}": ${err}`);
        if (!nextToken) {
          // Only clear query on initial search failure, not pagination failure
          setCurrentQuery(null, null);
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      currentPrefix,
      error,
      getCachedOrNull,
      setCachedSearchResults,
      setLoading,
      setCurrentQuery,
      setRequestCount,
      searchService,
    ]
  );

  /**
   * Clear current query and results
   */
  const clearResults = useCallback(() => {
    setCurrentQuery(null, null);
  }, [setCurrentQuery]);

  /**
   * Invalidate current query cache and refetch
   */
  const invalidateCurrentQuery = useCallback(() => {
    if (currentQuery && currentCachedPrefix !== null) {
      invalidateQuery(currentQuery, currentCachedPrefix);
      // Refetch with force refresh
      search(currentQuery, undefined, true);
    }
  }, [currentQuery, currentCachedPrefix, invalidateQuery, search]);

  return {
    search,
    clearResults,
    invalidateCurrentQuery,
    cancelSearch,
    isLoading,
    searchResults,
    requestCount,
    hasResults: searchResults !== null && searchResults.totalKeys > 0,
    canLoadMore: searchResults?.nextToken !== undefined,
  };
};
