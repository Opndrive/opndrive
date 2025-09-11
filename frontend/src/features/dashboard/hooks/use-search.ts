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
        console.log('🚀 Starting search for:', query, 'in prefix:', currentPrefix);
        const results = await searchService.searchFiles(query, currentPrefix || '', {
          onProgress: (progress) => {
            console.log('📊 Search progress:', progress);
            if (progress.status === 'error') {
              error('Search failed');
            }
          },
          onError: (errorMessage) => {
            console.error('❌ Search error callback:', errorMessage);
            error(errorMessage);
          },
        });

        console.log('📋 Search results received:', results);
        setSearchResults(results);

        if (results.matches.length === 0) {
          console.log('🚫 No results found');
          success(`No results found for "${query}"`);
        } else {
          console.log('✅ Found results:', results.matches.length);
          success(`Found ${results.matches.length} results for "${query}"`);
        }
      } catch (err) {
        console.error('💥 Search catch block:', err);
        error(`Failed to search for "${query}"`);
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
        console.log('📄 Loading more results for:', query, 'token:', nextToken);
        const results = await searchService.searchWithPagination(
          query,
          currentPrefix || '',
          nextToken,
          {
            onProgress: (progress) => {
              console.log('📊 Paginated search progress:', progress);
              if (progress.status === 'error') {
                error('Search failed');
              }
            },
            onError: (errorMessage) => {
              console.error('❌ Paginated search error:', errorMessage);
              error(errorMessage);
            },
          }
        );

        console.log('📋 Paginated results received:', results);
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
        console.error('💥 Paginated search catch block:', err);
        error(`Failed to load more results for "${query}"`);
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
