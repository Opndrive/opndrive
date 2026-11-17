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

/**
 * How many objects one search call reads before handing back a resume token,
 * matched or not. It used to be compared with the number of matches, so a
 * search for something that is not there read the entire bucket in one go.
 */
const GLOBAL_SCAN_THRESHOLD = 100_000;
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
    let scanned = 0; // objects listed, matched or not
    let totalResultsCount = 0; // Track total files + folders
    let initialBatchCount = 0; // Track items loaded in THIS batch (not total)
    let apiRequestCount = 0; // Track number of API requests made in this search call

    while (current || queue.length) {
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

      // Not queued for a search of their own. The listing has no delimiter,
      // so it already reaches everything below this prefix, folders included;
      // following a matched folder listed its whole subtree a second time.
      if (page.folders?.length) {
        allFolders.push(...page.folders);
      }

      scanned += page.scannedKeys ?? page.totalKeys;
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

      // Where to read next, decided before deciding whether to stop, so that
      // stopping hands back a token for exactly what is left. S3 sends a
      // continuation token only while a prefix has more to list.
      if (page.nextToken) {
        current.nextToken = page.nextToken;
      } else {
        // This prefix is done. Move on to whatever is still queued, which a
        // resume token from before folders stopped being queued may hold;
        // stopping outright here dropped those without saying so.
        current = undefined;
      }

      // Stop for now once this call has found a batch of results, or read its
      // share of the bucket - but only with something left to read. A token
      // for nothing left showed "Load more" for a search that was finished.
      const somethingLeft = current !== undefined || queue.length > 0;
      const batchFull = initialBatchCount >= INITIAL_RESULTS_LIMIT;
      const readEnough = scanned >= GLOBAL_SCAN_THRESHOLD;
      if (somethingLeft && (batchFull || readEnough)) {
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
