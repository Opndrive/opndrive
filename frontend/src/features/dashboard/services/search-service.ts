import type { SearchResult, BYOS3ApiProvider } from '@opndrive/s3-api';
import type { _Object } from '@aws-sdk/client-s3';

export interface SearchOptions {
  onProgress?: (progress: { status: 'searching' | 'success' | 'error'; error?: string }) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
  onResultsUpdate?: (partialResults: SearchResult) => void; // Stream results as they come
  onRequestCountUpdate?: (count: number) => void; // Track number of API requests made
}

const GLOBAL_SCAN_THRESHOLD = 100_000; // stop after scanning 100k items per request
const INITIAL_RESULTS_LIMIT = 50; // Stop after 50 results for initial search

type ResumeState = {
  queue: string[];
  current?: { prefix: string; nextToken?: string };
};

const encodeResumeToken = (state: ResumeState): string => {
  const json = JSON.stringify(state);
  if (typeof window !== 'undefined' && typeof btoa === 'function') {
    return btoa(json);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return Buffer.from(json, 'utf-8').toString('base64');
};

const decodeResumeToken = (token: string): ResumeState => {
  try {
    const json =
      typeof window !== 'undefined' && typeof atob === 'function'
        ? atob(token)
        : // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          Buffer.from(token, 'base64').toString('utf-8');
    return JSON.parse(json) as ResumeState;
  } catch {
    return { queue: [] };
  }
};

class SearchService {
  private api: BYOS3ApiProvider;

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  async search(
    query: string,
    prefix: string = '',
    nextToken?: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { onProgress, onError, signal } = options;

    try {
      if (signal?.aborted) throw new Error('Search cancelled');
      onProgress?.({ status: 'searching' });

      const normalizedPrefix = prefix === '/' ? '' : prefix || '';
      const resumeState = nextToken ? decodeResumeToken(nextToken) : undefined;
      const result = await this.traverseUntilThreshold(
        query,
        normalizedPrefix,
        resumeState,
        options
      );

      onProgress?.({ status: 'success' });
      options.onComplete?.();
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Search cancelled') throw error;
      const errorMessage = error instanceof Error ? error.message : 'Failed to search files';
      onProgress?.({ status: 'error', error: errorMessage });
      onError?.(errorMessage);
      throw error;
    }
  }

  private async traverseUntilThreshold(
    query: string,
    rootPrefix: string,
    state: ResumeState | undefined,
    options: SearchOptions
  ): Promise<SearchResult> {
    const { signal, onResultsUpdate, onRequestCountUpdate } = options;
    const allFiles: _Object[] = [];
    const allFolders: _Object[] = [];
    const queue: string[] = state?.queue?.slice() ?? [rootPrefix];
    let current = state?.current ? { ...state.current } : undefined;
    let scanned = 0; // total keys scanned
    let totalResultsCount = 0; // Track total files + folders
    let initialBatchCount = 0; // Track items loaded in THIS batch (not total)
    let apiRequestCount = 0; // Track number of API requests made in this search call

    while (scanned < GLOBAL_SCAN_THRESHOLD && (current || queue.length)) {
      if (signal?.aborted) throw new Error('Search cancelled');

      if (!current) {
        const nextPrefix = queue.shift();
        if (nextPrefix === undefined && queue.length === 0) break;
        if (nextPrefix === undefined) continue;
        current = { prefix: nextPrefix };
      }

      // Increment API request count before making the call
      apiRequestCount++;

      // Notify about the request count update
      if (onRequestCountUpdate) {
        onRequestCountUpdate(apiRequestCount);
      }

      // Use the API's search method which returns segregated files/folders
      const page = await this.api.search({
        prefix: current.prefix === '/' ? '' : current.prefix,
        searchTerm: query,
        nextToken: current.nextToken,
      });

      // API returns already filtered and segregated results
      if (page.files?.length) {
        allFiles.push(...page.files);
      }

      if (page.folders?.length) {
        allFolders.push(...page.folders);
        // Add folders to queue for recursive search
        for (const folder of page.folders) {
          if (folder.Key) {
            queue.push(folder.Key);
          }
        }
      }

      scanned += page.totalKeys;
      const newItemsCount = (page.files?.length || 0) + (page.folders?.length || 0);
      initialBatchCount += newItemsCount;
      totalResultsCount = allFiles.length + allFolders.length;

      // Stream results to UI as they come in
      if (onResultsUpdate && (page.files?.length || page.folders?.length)) {
        onResultsUpdate({
          files: dedupeByKey(allFiles),
          totalFiles: allFiles.length,
          folders: dedupeByKey(allFolders),
          totalFolders: allFolders.length,
          totalKeys: totalResultsCount,
          nextToken: undefined, // Don't expose token in partial updates
          isTruncated: page.isTruncated,
        });
      }

      // Check if we've reached the initial results limit (50 items) for THIS batch
      // Apply limit to both initial search and "Load More" operations
      if (initialBatchCount >= INITIAL_RESULTS_LIMIT) {
        // Save state for continuation
        const resume: ResumeState = {
          queue,
          current: page.nextToken ? { ...current, nextToken: page.nextToken } : undefined,
        };
        return {
          files: dedupeByKey(allFiles),
          totalFiles: allFiles.length,
          folders: dedupeByKey(allFolders),
          totalFolders: allFolders.length,
          totalKeys: totalResultsCount,
          nextToken: encodeResumeToken(resume),
          isTruncated: true, // More results available
        };
      }

      // Check if there are more results using isTruncated and nextToken
      // isTruncated: false means there are more results, true means no more results
      if (page.nextToken && page.isTruncated === true) {
        // Continue pagination with the next token
        current.nextToken = page.nextToken;
      } else if (page.isTruncated === false) {
        // No more results, stop the search completely
        break;
      } else {
        // No next token and not explicitly truncated, move to next prefix
        current = undefined;
      }

      // If we reached the threshold, stop and return resume token
      if (scanned >= GLOBAL_SCAN_THRESHOLD) {
        const resume: ResumeState = { queue, current };
        return {
          files: dedupeByKey(allFiles),
          totalFiles: allFiles.length,
          folders: dedupeByKey(allFolders),
          totalFolders: allFolders.length,
          totalKeys: totalResultsCount,
          nextToken: encodeResumeToken(resume),
          isTruncated: true,
        };
      }
    }

    const nextTokenOut = undefined;
    return {
      files: dedupeByKey(allFiles),
      totalFiles: allFiles.length,
      folders: dedupeByKey(allFolders),
      totalFolders: allFolders.length,
      totalKeys: totalResultsCount,
      nextToken: nextTokenOut,
      isTruncated: false,
    };
  }
}

function dedupeByKey(items: _Object[]): _Object[] {
  const seen = new Set<string>();
  const out: _Object[] = [];
  for (const it of items) {
    const k = it.Key || '';
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

export const createSearchService = (api: BYOS3ApiProvider) => {
  return new SearchService(api);
};
