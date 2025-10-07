import { useCallback, useState } from 'react';
import { createSearchService } from '@/features/dashboard/services/search-service';
import { useNotification } from '@/context/notification-context';
import { useDriveStore } from '@/context/data-context';
import { SearchResult } from '@opndrive/s3-api';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export const useSearch = () => {
  const [activeSearches, setActiveSearches] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { error } = useNotification();
  const { currentPrefix } = useDriveStore();
  const { apiS3 } = useAuthGuard();

  if (!apiS3) {
    return {
      searchFiles: async () => {},
      searchWithPagination: async () => {},
      clearResults: () => {},
      isSearching: () => false,
      isLoading: false,
      searchResults: null,
      hasResults: false,
      canLoadMore: false,
    };
  }

  const searchService = createSearchService(apiS3);

  const searchFiles = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }

      const searchId = `search-${query}-${currentPrefix}`;

      setActiveSearches((prev) => new Set(prev).add(searchId));
      setIsLoading(true);

      const prefix = currentPrefix === '/' ? '' : currentPrefix;

      try {
        const results = await searchService.searchFiles(query, prefix ?? '', {
          onProgress: (progress) => {
            if (progress.status === 'error') {
              error('Search failed');
            }
          },
          onError: (errorMessage) => {
            error(errorMessage);
          },
        });

        setSearchResults(results);

        // Results are set without showing success notifications
      } catch (err) {
        error(`Failed to search for "${query}","${err}"`);
        setSearchResults(null);
      } finally {
        setIsLoading(false);
        setActiveSearches((prev) => {
          const newSet = new Set(prev);
          newSet.delete(searchId);
          return newSet;
        });
      }
    },
    [currentPrefix, error]
  );

  const searchWithPagination = useCallback(
    async (query: string, nextToken?: string) => {
      if (!query.trim()) return;

      const searchId = `search-paginated-${query}-${currentPrefix}`;

      setActiveSearches((prev) => new Set(prev).add(searchId));
      setIsLoading(true);

      try {
        const results = await searchService.searchWithPagination(
          query,
          currentPrefix || '',
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
          setSearchResults((prev) =>
            prev
              ? {
                  matches: [...prev.matches, ...results.matches],
                  nextToken: results.nextToken,
                }
              : results
          );
        } else {
          setSearchResults(results);
        }
      } catch (err) {
        error(`Failed to load more results for "${query},"${err}"`);
      } finally {
        setIsLoading(false);
        setActiveSearches((prev) => {
          const newSet = new Set(prev);
          newSet.delete(searchId);
          return newSet;
        });
      }
    },
    [currentPrefix, searchResults, error]
  );

  const clearResults = useCallback(() => {
    setSearchResults(null);
  }, []);

  const isSearching = useCallback(
    (searchTerm: string) => {
      const searchId = `search-${searchTerm}-${currentPrefix}`;
      return activeSearches.has(searchId);
    },
    [activeSearches, currentPrefix]
  );

  return {
    searchFiles,
    searchWithPagination,
    clearResults,
    isSearching,
    isLoading,
    searchResults,
    hasResults: searchResults && searchResults.matches.length > 0,
    canLoadMore: searchResults?.nextToken !== undefined,
  };
};
