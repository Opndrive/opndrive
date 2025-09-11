import { useCallback, useState } from 'react';
import { searchService, SearchResult } from '@/features/dashboard/services/search-service';
import { useNotification } from '@/context/notification-context';
import { useDriveStore } from '@/context/data-context';

export const useSearch = () => {
  const [activeSearches, setActiveSearches] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { success, error } = useNotification();
  const { currentPrefix } = useDriveStore();

  const searchFiles = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }

      const searchId = `search-${query}-${currentPrefix}`;

      setActiveSearches((prev) => new Set(prev).add(searchId));
      setIsLoading(true);

      try {
        const results = await searchService.searchFiles(query, currentPrefix || '', {
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

        if (results.matches.length === 0) {
          success(`No results found for "${query}"`);
        } else {
          success(`Found ${results.matches.length} results for "${query}"`);
        }
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
    [currentPrefix, success, error]
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
    [currentPrefix, searchResults, success, error]
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
