import { useCallback } from 'react';
import { createSearchService } from '@/features/dashboard/services/search-service';
import { useNotification } from '@/context/notification-context';
import { useDriveStore } from '@/context/data-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';

export const useSearch = () => {
  const { error } = useNotification();
  const { currentPrefix } = useDriveStore();
  const { apiS3 } = useAuthGuard();

  // Use Zustand store instead of local state
  const {
    isLoading,
    setSearchResults: setCachedSearchResults,
    getCachedOrNull,
    setLoading,
    setCurrentQuery,
    invalidateQuery,
  } = useSearchStore();

  // Get current search results from store
  const currentQuery = useSearchStore((state) => state.currentQuery);
  const currentCachedPrefix = useSearchStore((state) => state.currentPrefix);

  // Compute searchResults from cache based on current query
  const searchResults =
    currentQuery && currentCachedPrefix !== null
      ? getCachedOrNull(currentQuery, currentCachedPrefix)
      : null;

  if (!apiS3) {
    return {
      searchFiles: async () => {},
      searchWithPagination: async () => {},
      clearResults: () => {},
      invalidateCurrentQuery: () => {},
      isLoading: false,
      searchResults: null,
      hasResults: false,
      canLoadMore: false,
    };
  }

  const searchService = createSearchService(apiS3);

  /**
   * Search files with automatic caching
   * Checks cache first, only makes API call if needed
   */
  const searchFiles = useCallback(
    async (query: string, forceRefresh = false) => {
      if (!query.trim()) {
        setCurrentQuery(null, null);
        return;
      }

      const normalizedPrefix = currentPrefix === '/' ? '' : currentPrefix || '';

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
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

      // Cache miss or force refresh - fetch from API
      setLoading(true);
      setCurrentQuery(query, normalizedPrefix);

      try {
        const results = await searchService.searchFiles(query, normalizedPrefix, {
          onProgress: (progress) => {
            if (progress.status === 'error') {
              error('Search failed');
            }
          },
          onError: (errorMessage) => {
            error(errorMessage);
          },
        });

        // Store results in cache
        setCachedSearchResults(query, normalizedPrefix, results);

        console.log(
          `[useSearch] Fetched and cached ${results.matches.length} results for query: "${query}"`
        );
      } catch (err) {
        error(`Failed to search for "${query}": ${err}`);
        setCurrentQuery(null, null);
      } finally {
        setLoading(false);
      }
    },
    [currentPrefix, error, getCachedOrNull, setCachedSearchResults, setLoading, setCurrentQuery]
  );

  /**
   * Search with pagination for loading more results
   * Appends to existing results in cache
   */
  const searchWithPagination = useCallback(
    async (query: string, nextToken?: string) => {
      if (!query.trim()) return;

      const normalizedPrefix = currentPrefix === '/' ? '' : currentPrefix || '';

      setLoading(true);

      try {
        const results = await searchService.searchWithPagination(
          query,
          normalizedPrefix,
          nextToken,
          {
            onProgress: (progress) => {
              if (progress.status === 'error') {
                error('Search failed');
              }
            },
            onError: (errorMessage) => {
              error(errorMessage);
            },
          }
        );

        if (nextToken && searchResults) {
          // Append new results to existing ones
          const updatedResults = {
            matches: [...searchResults.matches, ...results.matches],
            nextToken: results.nextToken,
          };
          setCachedSearchResults(query, normalizedPrefix, updatedResults);
        } else {
          // First page or no existing results
          setCachedSearchResults(query, normalizedPrefix, results);
        }

        setCurrentQuery(query, normalizedPrefix);
      } catch (err) {
        error(`Failed to load more results for "${query}": ${err}`);
      } finally {
        setLoading(false);
      }
    },
    [
      currentPrefix,
      searchResults,
      error,
      setCachedSearchResults,
      setLoading,
      setCurrentQuery,
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
      searchFiles(currentQuery, true);
    }
  }, [currentQuery, currentCachedPrefix, invalidateQuery, searchFiles]);

  return {
    searchFiles,
    searchWithPagination,
    clearResults,
    invalidateCurrentQuery,
    isLoading,
    searchResults,
    hasResults: searchResults !== null && searchResults.matches.length > 0,
    canLoadMore: searchResults?.nextToken !== undefined,
  };
};
