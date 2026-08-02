/**
 * Search service: a breadth-first walk over prefixes, stopping early and
 * handing back a resume token.
 *
 * The provider is injected, so it is faked rather than mocked through the
 * module registry. s3-api's `search` already returns files and folders
 * segregated and filtered; what this layer adds is the traversal, the 50-result
 * batch limit, deduplication, and the opaque continuation token.
 *
 * `isTruncated` reads backwards here and is easy to misremember: the service
 * paginates while it is `true` and stops when it is `false`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BYOS3ApiProvider, SearchResult } from '@opndrive/s3-api';
import { createSearchService } from './search-service';

type Page = Partial<SearchResult>;

/** Builds a provider whose `search` returns the given pages in order. */
function apiReturning(...pages: Page[]) {
  const search = vi.fn(async () => {
    const page = pages.shift() ?? {};
    return {
      files: [],
      folders: [],
      totalFiles: 0,
      totalFolders: 0,
      totalKeys: 0,
      isTruncated: false,
      ...page,
    } as SearchResult;
  });
  return { search } as unknown as BYOS3ApiProvider & { search: typeof search };
}

const file = (Key: string) => ({ Key });
const folderKey = (Key: string) => ({ Key });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searching', () => {
  it('asks the provider for the query at the given prefix', async () => {
    const api = apiReturning({ files: [file('docs/a.txt')] });

    await createSearchService(api).search('report', 'docs/');

    expect(api.search).toHaveBeenCalledWith({
      prefix: 'docs/',
      searchTerm: 'report',
      nextToken: undefined,
    });
  });

  it('normalises a root prefix of "/" to empty', async () => {
    const api = apiReturning({});

    await createSearchService(api).search('report', '/');

    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ prefix: '' }));
  });

  it('defaults to the bucket root', async () => {
    const api = apiReturning({});

    await createSearchService(api).search('report');

    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ prefix: '' }));
  });

  it('returns the matched files and folders', async () => {
    const api = apiReturning({
      files: [file('docs/a.txt'), file('docs/b.txt')],
      folders: [folderKey('docs/reports/')],
    });

    const result = await createSearchService(api).search('report', 'docs/');

    expect(result.files.map((f) => f.Key)).toEqual(['docs/a.txt', 'docs/b.txt']);
    expect(result.folders.map((f) => f.Key)).toEqual(['docs/reports/']);
    expect(result).toMatchObject({ totalFiles: 2, totalFolders: 1, totalKeys: 3 });
  });

  it('reports an empty search cleanly', async () => {
    const result = await createSearchService(apiReturning({})).search('nothing', 'docs/');

    expect(result).toMatchObject({
      files: [],
      folders: [],
      totalFiles: 0,
      totalKeys: 0,
      nextToken: undefined,
      isTruncated: false,
    });
  });
});

describe('recursive traversal', () => {
  it('queues matched folders and searches inside them', async () => {
    // isTruncated must be left undefined here: `false` breaks the whole walk
    // (see the test below), and `true` + a token keeps paginating this prefix
    // instead of moving on to the queued folder.
    const api = apiReturning(
      { folders: [folderKey('docs/reports/')], totalKeys: 1, isTruncated: undefined },
      { files: [file('docs/reports/q4.pdf')], totalKeys: 1 }
    );

    const result = await createSearchService(api).search('q4', 'docs/');

    // A match nested one level down is only found if the folder is followed.
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(api.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ prefix: 'docs/reports/' })
    );
    expect(result.files.map((f) => f.Key)).toEqual(['docs/reports/q4.pdf']);
  });

  it('paginates a prefix while the page says there is more', async () => {
    const api = apiReturning(
      { files: [file('a.txt')], nextToken: 'page-2', isTruncated: true, totalKeys: 1 },
      { files: [file('b.txt')], isTruncated: false, totalKeys: 1 }
    );

    const result = await createSearchService(api).search('x', 'docs/');

    expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ nextToken: 'page-2' }));
    expect(result.files.map((f) => f.Key)).toEqual(['a.txt', 'b.txt']);
  });

  it('KNOWN BUG: a complete first page abandons folders already queued for search', async () => {
    const api = apiReturning(
      { files: [file('a.txt')], folders: [folderKey('sub/')], isTruncated: false, totalKeys: 2 },
      { files: [file('sub/b.txt')] }
    );

    const result = await createSearchService(api).search('x', 'docs/');

    // `isTruncated: false` from s3-api means "this prefix's listing is
    // complete" - it says nothing about the folders this walk has queued. The
    // service treats it as "stop everything" and `break`s out of the loop, so
    // sub/ is never searched and sub/b.txt is silently missing from a search
    // that reports itself finished and not truncated.
    //
    // Pinned, not endorsed. Replacing the `break` with `current = undefined`
    // (move on to the next queued prefix) would make this fail, which is the
    // prompt to confirm the intended traversal semantics.
    expect(api.search).toHaveBeenCalledOnce();
    expect(result.files.map((f) => f.Key)).toEqual(['a.txt']);
    expect(result.isTruncated).toBe(false);
  });

  it('removes duplicate keys from the results', async () => {
    const api = apiReturning({
      files: [file('a.txt'), file('a.txt'), file('b.txt')],
      totalKeys: 3,
    });

    const result = await createSearchService(api).search('x', 'docs/');

    // The same object can surface under two prefixes during a walk.
    expect(result.files.map((f) => f.Key)).toEqual(['a.txt', 'b.txt']);
  });

  it('drops entries with no key when deduplicating', async () => {
    const api = apiReturning({ files: [file('a.txt'), { Key: undefined }], totalKeys: 2 });

    const result = await createSearchService(api).search('x', 'docs/');

    expect(result.files.map((f) => f.Key)).toEqual(['a.txt']);
  });

  it('KNOWN BUG: totalFiles counts duplicates that were removed from files', async () => {
    const api = apiReturning({ files: [file('a.txt'), file('a.txt')], totalKeys: 2 });

    const result = await createSearchService(api).search('x', 'docs/');

    // `files` is deduplicated but `totalFiles` is taken from the raw array, so
    // the UI reports a count higher than the number of rows it can show.
    //
    // Pinned, not endorsed: counting after the dedupe would make this fail.
    expect(result.files).toHaveLength(1);
    expect(result.totalFiles).toBe(2);
  });
});

describe('batch limit and resuming', () => {
  const fiftyFiles = Array.from({ length: 50 }, (_, i) => file(`f${i}.txt`));

  it('stops once 50 results are collected and offers a resume token', async () => {
    const api = apiReturning({ files: fiftyFiles, totalKeys: 50, nextToken: 'more' });

    const result = await createSearchService(api).search('x', 'docs/');

    expect(result.files).toHaveLength(50);
    expect(result.isTruncated).toBe(true);
    expect(result.nextToken).toBeTruthy();
  });

  it('resumes from where it stopped', async () => {
    const first = apiReturning({ files: fiftyFiles, totalKeys: 50, nextToken: 'page-2' });
    const initial = await createSearchService(first).search('x', 'docs/');

    const second = apiReturning({ files: [file('later.txt')], totalKeys: 1 });
    const resumed = await createSearchService(second).search('x', 'docs/', initial.nextToken);

    // The token has to carry the page cursor, or "Load more" restarts the walk.
    expect(second.search).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'docs/', nextToken: 'page-2' })
    );
    expect(resumed.files.map((f) => f.Key)).toEqual(['later.txt']);
  });

  it('KNOWN BUG: a corrupt resume token returns nothing instead of restarting', async () => {
    const api = apiReturning({ files: [file('a.txt')], totalKeys: 1 });

    const result = await createSearchService(api).search('x', 'docs/', 'not-a-real-token');

    // decodeResumeToken swallows the failure and returns `{ queue: [] }`. An
    // empty array is not nullish, so it wins over the `?? [rootPrefix]`
    // fallback and the walk has nowhere to start - the provider is never even
    // called and "Load more" silently reports no results rather than an error.
    //
    // Pinned, not endorsed: returning `{ queue: [rootPrefix] }` from the catch
    // would make this fail, which is the prompt to decide whether a bad token
    // should restart or surface.
    expect(api.search).not.toHaveBeenCalled();
    expect(result.files).toEqual([]);
    expect(result.isTruncated).toBe(false);
  });

  it('reports no more results once the walk finishes', async () => {
    const api = apiReturning({ files: [file('a.txt')], totalKeys: 1 });

    const result = await createSearchService(api).search('x', 'docs/');

    expect(result.nextToken).toBeUndefined();
    expect(result.isTruncated).toBe(false);
  });
});

describe('progress callbacks', () => {
  it('reports searching then success', async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    await createSearchService(apiReturning({})).search('x', 'docs/', undefined, {
      onProgress,
      onComplete,
    });

    expect(onProgress.mock.calls.map(([p]) => p.status)).toEqual(['searching', 'success']);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('streams partial results as pages arrive', async () => {
    const onResultsUpdate = vi.fn();
    const api = apiReturning(
      { files: [file('a.txt')], nextToken: 'p2', isTruncated: true, totalKeys: 1 },
      { files: [file('b.txt')], isTruncated: false, totalKeys: 1 }
    );

    await createSearchService(api).search('x', 'docs/', undefined, { onResultsUpdate });

    // The UI fills in as the walk proceeds instead of waiting for the end.
    expect(onResultsUpdate).toHaveBeenCalledTimes(2);
    expect(onResultsUpdate.mock.calls[0]![0].files.map((f: { Key: string }) => f.Key)).toEqual([
      'a.txt',
    ]);
    expect(onResultsUpdate.mock.calls[1]![0].files.map((f: { Key: string }) => f.Key)).toEqual([
      'a.txt',
      'b.txt',
    ]);
  });

  it('does not stream a page that matched nothing', async () => {
    const onResultsUpdate = vi.fn();

    await createSearchService(apiReturning({ totalKeys: 10 })).search('x', 'docs/', undefined, {
      onResultsUpdate,
    });

    expect(onResultsUpdate).not.toHaveBeenCalled();
  });

  it('never exposes a resume token in a partial update', async () => {
    const onResultsUpdate = vi.fn();
    const api = apiReturning({ files: [file('a.txt')], totalKeys: 1, nextToken: 'p2' });

    await createSearchService(api).search('x', 'docs/', undefined, { onResultsUpdate });

    // Only the settled result carries a token the caller may resume from.
    expect(onResultsUpdate.mock.calls[0]![0].nextToken).toBeUndefined();
  });

  it('reports how many requests the walk has made', async () => {
    const onRequestCountUpdate = vi.fn();
    const api = apiReturning(
      { folders: [folderKey('sub/')], totalKeys: 1, isTruncated: undefined },
      { files: [file('sub/a.txt')], totalKeys: 1 }
    );

    await createSearchService(api).search('x', 'docs/', undefined, { onRequestCountUpdate });

    // Drives the "searched N folders" indicator.
    expect(onRequestCountUpdate.mock.calls.map(([n]) => n)).toEqual([1, 2]);
  });
});

describe('cancellation', () => {
  it('refuses to start when the signal is already aborted', async () => {
    const api = apiReturning({});
    const controller = new AbortController();
    controller.abort();

    await expect(
      createSearchService(api).search('x', 'docs/', undefined, { signal: controller.signal })
    ).rejects.toThrow('Search cancelled');

    expect(api.search).not.toHaveBeenCalled();
  });

  it('stops between pages once aborted', async () => {
    const controller = new AbortController();
    const api = apiReturning(
      { files: [file('a.txt')], nextToken: 'p2', isTruncated: true, totalKeys: 1 },
      { files: [file('b.txt')], totalKeys: 1 }
    );
    vi.mocked(api.search).mockImplementationOnce(async () => {
      controller.abort();
      return {
        files: [file('a.txt')],
        folders: [],
        totalFiles: 1,
        totalFolders: 0,
        totalKeys: 1,
        nextToken: 'p2',
        isTruncated: true,
      } as SearchResult;
    });

    await expect(
      createSearchService(api).search('x', 'docs/', undefined, { signal: controller.signal })
    ).rejects.toThrow('Search cancelled');

    expect(api.search).toHaveBeenCalledOnce();
  });

  it('does not route a cancellation through the error callbacks', async () => {
    const onError = vi.fn();
    const onProgress = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await expect(
      createSearchService(apiReturning({})).search('x', 'docs/', undefined, {
        signal: controller.signal,
        onError,
        onProgress,
      })
    ).rejects.toThrow('Search cancelled');

    // The user cancelled on purpose; showing them an error toast would be wrong.
    expect(onError).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});

describe('failures', () => {
  it('surfaces a provider error through every channel', async () => {
    const api = { search: vi.fn(async () => Promise.reject(new Error('AccessDenied'))) };
    const onProgress = vi.fn();
    const onError = vi.fn();

    await expect(
      createSearchService(api as unknown as BYOS3ApiProvider).search('x', 'docs/', undefined, {
        onProgress,
        onError,
      })
    ).rejects.toThrow('AccessDenied');

    expect(onProgress).toHaveBeenLastCalledWith({ status: 'error', error: 'AccessDenied' });
    expect(onError).toHaveBeenCalledExactlyOnceWith('AccessDenied');
  });

  it('describes a non-Error rejection', async () => {
    const api = { search: vi.fn(async () => Promise.reject('just a string')) };
    const onError = vi.fn();

    await expect(
      createSearchService(api as unknown as BYOS3ApiProvider).search('x', 'docs/', undefined, {
        onError,
      })
    ).rejects.toBeDefined();

    expect(onError).toHaveBeenCalledExactlyOnceWith('Failed to search files');
  });

  it('works with no options at all', async () => {
    await expect(createSearchService(apiReturning({})).search('x', 'docs/')).resolves.toBeDefined();
  });
});
