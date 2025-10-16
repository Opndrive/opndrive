import type { SearchResult, BYOS3ApiProvider } from '@opndrive/s3-api';
import type { _Object } from '@aws-sdk/client-s3';

// Define extended interface for this.api with search method

export interface SearchOptions {
  onProgress?: (progress: { status: 'searching' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  signal?: AbortSignal; // Add AbortSignal support
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
    const { onProgress, onError, signal } = options;

    try {
      // Check if already aborted
      if (signal?.aborted) {
        throw new Error('Search cancelled');
      }

      onProgress?.({ status: 'searching' });

      // Always use fallback search to ensure we get both files and folders
      // The S3 search method only returns Contents, not CommonPrefixes (folders)
      return this.fallbackSearch(query, prefix, options);
    } catch (error) {
      // Handle abortion gracefully
      if (error instanceof Error && error.message === 'Search cancelled') {
        console.log('Search was cancelled by user');
        throw error;
      }

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
    const { onProgress, onComplete, onError, signal } = options;

    try {
      // Use recursive search to find all matching files and folders
      const allItems = await this.recursivelySearchDirectories(
        query,
        prefix === '/' ? '' : prefix,
        signal
      );

      // Check if cancelled after search completes
      if (signal?.aborted) {
        throw new Error('Search cancelled');
      }

      const result: SearchResult = {
        matches: allItems,
      };

      onProgress?.({ status: 'success' });
      onComplete?.();
      return result;
    } catch (error) {
      // Handle abortion gracefully
      if (error instanceof Error && error.message === 'Search cancelled') {
        throw error;
      }

      console.error('Fallback search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search files';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  private async recursivelySearchDirectories(
    query: string,
    prefix: string = '',
    signal?: AbortSignal
  ): Promise<_Object[]> {
    const matches: _Object[] = [];
    const visitedPrefixes = new Set<string>();

    const searchInDirectory = async (currentPrefix: string): Promise<void> => {
      // Check if search was cancelled
      if (signal?.aborted) {
        throw new Error('Search cancelled');
      }

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
              matches.push(file);
            }
          });
        }

        // Search in folder names and recurse into folders
        if (structure.folders && structure.folders.length > 0) {
          for (const folder of structure.folders) {
            if (folder.Prefix) {
              // Extract just the folder name for matching
              const folderName = folder.Prefix.split('/').filter(Boolean).pop() || '';

              // Check if folder name matches (search in folder name, not full path)
              if (
                folderName.toLowerCase().includes(query.toLowerCase()) ||
                folder.Prefix.toLowerCase().includes(query.toLowerCase())
              ) {
                // Create a mock _Object for the folder
                // Ensure folder Key ends with '/' to be properly detected as folder
                const folderKey = folder.Prefix.endsWith('/') ? folder.Prefix : folder.Prefix + '/';
                matches.push({
                  Key: folderKey,
                  LastModified: new Date(),
                  Size: 0,
                  ETag: '',
                  StorageClass: 'STANDARD',
                });
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
                  matches.push(file);
                }
              });
            }

            // Search in paginated folders and recurse
            if (paginatedStructure.folders) {
              for (const folder of paginatedStructure.folders) {
                if (folder.Prefix) {
                  // Extract just the folder name for matching
                  const folderName = folder.Prefix.split('/').filter(Boolean).pop() || '';

                  if (
                    folderName.toLowerCase().includes(query.toLowerCase()) ||
                    folder.Prefix.toLowerCase().includes(query.toLowerCase())
                  ) {
                    // Ensure folder Key ends with '/' to be properly detected as folder
                    const folderKey = folder.Prefix.endsWith('/')
                      ? folder.Prefix
                      : folder.Prefix + '/';
                    matches.push({
                      Key: folderKey,
                      LastModified: new Date(),
                      Size: 0,
                      ETag: '',
                      StorageClass: 'STANDARD',
                    });
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
        // Don't log errors for cancelled searches
        if (error instanceof Error && error.message === 'Search cancelled') {
          throw error; // Re-throw to stop the search
        }

        console.error(`Error searching in directory ${currentPrefix}:`, error);
        // Continue searching other directories even if one fails
      }
    };

    // Start recursive search from the given prefix
    await searchInDirectory(prefix);

    // Remove duplicates based on Key and return
    const uniqueMatches = matches.filter(
      (item, index, arr) => arr.findIndex((other) => other.Key === item.Key) === index
    );

    return uniqueMatches;
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

      // For root search or if no nextToken (first search), do recursive search
      if (!prefix || prefix === '' || prefix === '/' || !nextToken) {
        // Use recursive search to get all matching items
        const allItems = await this.recursivelySearchDirectories(
          query,
          prefix === '/' ? '' : prefix
        );

        const result: SearchResult = {
          matches: allItems,
          nextToken: undefined, // Recursive search doesn't use pagination
        };

        onProgress?.({ status: 'success' });
        onComplete?.();
        return result;
      }

      // For non-root searches with pagination, use directory structure
      const structure = await this.api.fetchDirectoryStructure(prefix, 1000, nextToken);

      const matches: _Object[] = [];

      if (structure.files) {
        structure.files.forEach((file) => {
          if (file.Key && file.Key.toLowerCase().includes(query.toLowerCase())) {
            matches.push(file);
          }
        });
      }

      if (structure.folders) {
        structure.folders.forEach((folder) => {
          if (folder.Prefix) {
            // Extract just the folder name for matching
            const folderName = folder.Prefix.split('/').filter(Boolean).pop() || '';

            if (
              folderName.toLowerCase().includes(query.toLowerCase()) ||
              folder.Prefix.toLowerCase().includes(query.toLowerCase())
            ) {
              // Ensure folder Key ends with '/' to be properly detected as folder
              const folderKey = folder.Prefix.endsWith('/') ? folder.Prefix : folder.Prefix + '/';
              matches.push({
                Key: folderKey,
                LastModified: new Date(),
                Size: 0,
                ETag: '',
                StorageClass: 'STANDARD',
              });
            }
          }
        });
      }

      const result: SearchResult = {
        matches,
        nextToken: structure.nextToken,
      };

      onProgress?.({ status: 'success' });
      onComplete?.();
      return result;
    } catch (error) {
      // Don't log errors for cancelled searches
      if (error instanceof Error && error.message === 'Search cancelled') {
        throw error;
      }

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
