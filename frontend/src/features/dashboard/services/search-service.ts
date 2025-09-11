import { apiS3 } from '@/services/byo-s3-api';
import type { DirectoryStructure } from '@opndrive/s3-api';

// Define extended interface for apiS3 with search method
interface S3ApiWithSearch {
  search(params: SearchParams): Promise<SearchResult>;
  fetchDirectoryStructure(
    prefix: string,
    maxKeys?: number,
    token?: string
  ): Promise<DirectoryStructure>;
}

export interface SearchParams {
  prefix: string;
  searchTerm: string;
  nextToken: string;
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
  async searchFiles(
    query: string,
    prefix: string = '',
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { onProgress, onComplete, onError } = options;

    try {
      console.log('🔍 Starting search for:', query, 'in prefix:', prefix);
      onProgress?.({ status: 'searching' });

      // Check if apiS3 has search method
      console.log(
        '📋 Available apiS3 methods:',
        Object.getOwnPropertyNames(Object.getPrototypeOf(apiS3))
      );

      if (typeof (apiS3 as unknown as S3ApiWithSearch).search === 'function') {
        console.log('✅ Using native search method');
        const searchParams: SearchParams = {
          prefix,
          searchTerm: query,
          nextToken: '',
        };
        const result = await (apiS3 as unknown as S3ApiWithSearch).search(searchParams);
        console.log('🎯 Native search result:', result);

        onProgress?.({ status: 'success' });
        onComplete?.();
        return result;
      } else {
        console.log('⚠️ Native search not available, using fallback');
        return this.fallbackSearch(query, prefix, options);
      }
    } catch (error) {
      console.error('❌ Search error:', error);
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
      console.log('🔄 Using fallback search with recursive directory traversal');

      const allItems = await this.recursivelySearchDirectories(query, prefix === '/' ? '' : prefix);

      console.log('� All items found across all directories:', allItems.length);
      console.log('🎯 Matches found:', allItems);

      const result: SearchResult = {
        matches: allItems,
      };

      onProgress?.({ status: 'success' });
      onComplete?.();
      return result;
    } catch (error) {
      console.error('❌ Fallback search error:', error);
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
      console.log(
        '🔍 Searching in directory:',
        currentPrefix || '(root)',
        '-> adjusted to:',
        adjustedPrefix || '(empty)'
      );

      try {
        const structure = await apiS3.fetchDirectoryStructure(adjustedPrefix, 1000);
        console.log('📊 Directory structure result:', {
          prefix: adjustedPrefix,
          filesCount: structure.files?.length || 0,
          foldersCount: structure.folders?.length || 0,
          isTruncated: structure.isTruncated,
          nextToken: structure.nextToken,
        });

        // Search in files
        if (structure.files && structure.files.length > 0) {
          console.log(
            '📄 Files in directory:',
            structure.files.map((f) => f.Key)
          );
          structure.files.forEach((file) => {
            if (file.Key && file.Key.toLowerCase().includes(query.toLowerCase())) {
              matches.push(file.Key);
              console.log('📄 Found file match:', file.Key);
            }
          });
        } else {
          console.log('📄 No files found in directory');
        }

        // Search in folder names and recurse into folders
        if (structure.folders && structure.folders.length > 0) {
          console.log(
            '📁 Folders in directory:',
            structure.folders.map((f) => f.Prefix)
          );
          for (const folder of structure.folders) {
            if (folder.Prefix) {
              // Check if folder name matches
              if (folder.Prefix.toLowerCase().includes(query.toLowerCase())) {
                matches.push(folder.Prefix);
                console.log('📁 Found folder match:', folder.Prefix);
              }

              // Recursively search inside this folder
              await searchInDirectory(folder.Prefix);
            }
          }
        } else {
          console.log('📁 No folders found in directory');
        }

        // Handle pagination if there are more items
        if (structure.nextToken && structure.isTruncated) {
          console.log('� Fetching more items with nextToken...');
          let nextToken: string | undefined = structure.nextToken;

          while (nextToken) {
            const paginatedStructure = await apiS3.fetchDirectoryStructure(
              currentPrefix,
              1000,
              nextToken
            );

            // Search in paginated files
            if (paginatedStructure.files) {
              paginatedStructure.files.forEach((file) => {
                if (file.Key && file.Key.toLowerCase().includes(query.toLowerCase())) {
                  matches.push(file.Key);
                  console.log('📄 Found paginated file match:', file.Key);
                }
              });
            }

            // Search in paginated folders and recurse
            if (paginatedStructure.folders) {
              for (const folder of paginatedStructure.folders) {
                if (folder.Prefix) {
                  if (folder.Prefix.toLowerCase().includes(query.toLowerCase())) {
                    matches.push(folder.Prefix);
                    console.log('📁 Found paginated folder match:', folder.Prefix);
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
        console.error(`❌ Error searching in directory ${currentPrefix}:`, error);
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
      console.log('🔍 Paginated search for:', query, 'token:', nextToken);
      onProgress?.({ status: 'searching' });

      if (typeof (apiS3 as unknown as S3ApiWithSearch).search === 'function') {
        const searchParams: SearchParams = {
          prefix,
          searchTerm: query,
          nextToken: nextToken || '',
        };
        const result = await (apiS3 as unknown as S3ApiWithSearch).search(searchParams);
        console.log('🎯 Paginated search result:', result);

        onProgress?.({ status: 'success' });
        onComplete?.();
        return result;
      } else {
        const structure = await apiS3.fetchDirectoryStructure(prefix, 1000, nextToken);

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
      console.error('❌ Paginated search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search files';

      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }
}

export const searchService = new SearchService();
