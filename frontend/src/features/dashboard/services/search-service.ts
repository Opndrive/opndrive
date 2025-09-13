import type { BYOS3ApiProvider, DirectoryStructure, SearchParams } from '@opndrive/s3-api';

// Define extended interface for this.api with search method
interface S3ApiWithSearch {
  search(params: SearchParams): Promise<SearchResult>;
  fetchDirectoryStructure(
    prefix: string,
    maxKeys?: number,
    token?: string
  ): Promise<DirectoryStructure>;
}

export interface SearchResult {
  matches: string[];
  nextToken?: string;
}

export interface SearchOptions {
  onProgress?: (progress: { status: 'searching' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

class SearchService {
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  async searchFiles(
    query: string,
    prefix: string = '',
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'searching' });

      // Check if this.api has search method

      if (typeof (this.api as unknown as S3ApiWithSearch).search === 'function') {
        const searchParams: SearchParams = {
          prefix,
          searchTerm: query,
          nextToken: undefined,
        };
        const result = await (this.api as unknown as S3ApiWithSearch).search(searchParams);

        onProgress?.({ status: 'success' });
        onComplete?.();
        return result;
      } else {
        return this.fallbackSearch(query, prefix, options);
      }
    } catch (error) {
      console.error('Search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search files';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  private async fallbackSearch(
    query: string,
    prefix: string = '',
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { onProgress, onComplete, onError } = options;

    try {
      const allItems = await this.recursivelySearchDirectories(query, prefix === '/' ? '' : prefix);

      const result: SearchResult = {
        matches: allItems,
      };

      onProgress?.({ status: 'success' });
      onComplete?.();
      return result;
    } catch (error) {
      console.error('Fallback search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search files';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  private async recursivelySearchDirectories(
    query: string,
    prefix: string = ''
  ): Promise<string[]> {
    const matches: string[] = [];
    const visitedPrefixes = new Set<string>();

    const searchInDirectory = async (currentPrefix: string): Promise<void> => {
      // Avoid infinite loops
      if (visitedPrefixes.has(currentPrefix)) {
        return;
      }
      visitedPrefixes.add(currentPrefix);

      // Try empty string for root directory instead of "/"
      const adjustedPrefix = currentPrefix === '/' ? '' : currentPrefix;

      try {
        const structure = await this.api.fetchDirectoryStructure(adjustedPrefix, 1000);

        // Search in files
        if (structure.files && structure.files.length > 0) {
          structure.files.forEach((file) => {
            if (file.Key && file.Key.toLowerCase().includes(query.toLowerCase())) {
              matches.push(file.Key);
            }
          });
        }

        // Search in folder names and recurse into folders
        if (structure.folders && structure.folders.length > 0) {
          for (const folder of structure.folders) {
            if (folder.Prefix) {
              // Check if folder name matches
              if (folder.Prefix.toLowerCase().includes(query.toLowerCase())) {
                matches.push(folder.Prefix);
              }

              // Recursively search inside this folder
              await searchInDirectory(folder.Prefix);
            }
          }
        }

        // Handle pagination if there are more items
        if (structure.nextToken && structure.isTruncated) {
          let nextToken: string | undefined = structure.nextToken;

          while (nextToken) {
            const paginatedStructure = await this.api.fetchDirectoryStructure(
              currentPrefix,
              1000,
              nextToken
            );

            // Search in paginated files
            if (paginatedStructure.files) {
              paginatedStructure.files.forEach((file) => {
                if (file.Key && file.Key.toLowerCase().includes(query.toLowerCase())) {
                  matches.push(file.Key);
                }
              });
            }

            // Search in paginated folders and recurse
            if (paginatedStructure.folders) {
              for (const folder of paginatedStructure.folders) {
                if (folder.Prefix) {
                  if (folder.Prefix.toLowerCase().includes(query.toLowerCase())) {
                    matches.push(folder.Prefix);
                  }

                  await searchInDirectory(folder.Prefix);
                }
              }
            }

            nextToken = paginatedStructure.nextToken;
            if (!paginatedStructure.isTruncated || !nextToken) break;
          }
        }
      } catch (error) {
        console.error(`Error searching in directory ${currentPrefix}:`, error);
        // Continue searching other directories even if one fails
      }
    };

    // Start recursive search from the given prefix
    await searchInDirectory(prefix);

    // Remove duplicates and return
    return Array.from(new Set(matches));
  }

  async searchWithPagination(
    query: string,
    prefix: string = '',
    nextToken?: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { onProgress, onComplete, onError } = options;

    try {
      onProgress?.({ status: 'searching' });

      if (typeof (this.api as unknown as S3ApiWithSearch).search === 'function') {
        const searchParams: SearchParams = {
          prefix,
          searchTerm: query,
          nextToken: nextToken || undefined,
        };
        const result = await (this.api as unknown as S3ApiWithSearch).search(searchParams);

        onProgress?.({ status: 'success' });
        onComplete?.();
        return result;
      } else {
        const structure = await this.api.fetchDirectoryStructure(prefix, 1000, nextToken);

        const allItems: string[] = [];

        if (structure.files) {
          structure.files.forEach((file) => {
            if (file.Key) {
              allItems.push(file.Key);
            }
          });
        }

        if (structure.folders) {
          structure.folders.forEach((folder) => {
            if (folder.Prefix) {
              allItems.push(folder.Prefix);
            }
          });
        }

        const matches = allItems.filter((item) => item.toLowerCase().includes(query.toLowerCase()));

        const result: SearchResult = {
          matches,
          nextToken: structure.nextToken,
        };

        onProgress?.({ status: 'success' });
        onComplete?.();
        return result;
      }
    } catch (error) {
      console.error('Paginated search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search files';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }
}

export const createSearchService = (api: BYOS3ApiProvider) => {
  return new SearchService(api);
};
