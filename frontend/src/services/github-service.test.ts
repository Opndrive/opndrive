/**
 * GitHub stats service.
 *
 * `fetch` is stubbed; nothing here touches the network.
 *
 * NOTE: this is a module-scope singleton with its own 5-minute cache, which
 * lives outside zustand and is therefore NOT covered by the store reset. Every
 * test clears it explicitly - without that, the first test to populate the
 * cache would satisfy all the others and they would pass without exercising
 * anything.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { githubService } from './github-service';

const repoPayload = {
  stargazers_count: 1234,
  forks_count: 56,
  open_issues_count: 7,
  watchers_count: 89,
};

function okResponse(body: unknown = repoPayload) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

function errorResponse(status = 404, statusText = 'Not Found') {
  return { ok: false, status, statusText, json: async () => ({}) };
}

beforeEach(() => {
  githubService.clearCache();
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 1));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  githubService.clearCache();
});

describe('fetchRepoData', () => {
  it('maps the GitHub payload onto our shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );

    const data = await githubService.fetchRepoData('Opndrive', 'opndrive');

    // The API's snake_case names never leak past this boundary.
    expect(data).toEqual({ stars: 1234, forks: 56, issues: 7, watchers: 89 });
  });

  it('calls the repo endpoint with the v3 accept header', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await githubService.fetchRepoData('Opndrive', 'opndrive');

    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/Opndrive/opndrive', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse(404))
    );

    // A missing repo must not break the page that renders the star count.
    await expect(githubService.fetchRepoData('nope', 'nope')).resolves.toBeNull();
  });

  it('returns null when the request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    await expect(githubService.fetchRepoData('Opndrive', 'opndrive')).resolves.toBeNull();
  });

  it('returns null when the body is not the expected JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }))
    );

    await expect(githubService.fetchRepoData('Opndrive', 'opndrive')).resolves.toBeNull();
  });

  it('does not cache a failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await githubService.fetchRepoData('Opndrive', 'opndrive');
    const second = await githubService.fetchRepoData('Opndrive', 'opndrive');

    // Caching a transient 500 would leave the count blank for five minutes.
    expect(second).toMatchObject({ stars: 1234 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('caching', () => {
  it('serves a repeat request from cache', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await githubService.fetchRepoData('Opndrive', 'opndrive');
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps repos apart', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await githubService.fetchRepoData('Opndrive', 'opndrive');
    await githubService.fetchRepoData('Opndrive', 'docs');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches once the entry is five minutes old', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still serves from cache just under the expiry', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports what it is holding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    expect(githubService.getCacheInfo()).toEqual({ size: 1, keys: ['Opndrive/opndrive'] });
  });

  it('empties on clearCache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );
    await githubService.fetchRepoData('Opndrive', 'opndrive');

    githubService.clearCache();

    expect(githubService.getCacheInfo()).toEqual({ size: 0, keys: [] });
  });
});

describe('fetchStarCount', () => {
  it('pulls just the star count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );

    await expect(githubService.fetchStarCount('Opndrive', 'opndrive')).resolves.toBe(1234);
  });

  it('returns null when the repo cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse())
    );

    // Distinguishable from a real zero, so the UI can hide the badge.
    await expect(githubService.fetchStarCount('nope', 'nope')).resolves.toBeNull();
  });

  it('reports a genuine zero as zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse({ ...repoPayload, stargazers_count: 0 }))
    );

    // `?? null` and not `|| null`: a brand-new repo has 0 stars, not "unknown".
    await expect(githubService.fetchStarCount('Opndrive', 'new')).resolves.toBe(0);
  });

  it('shares the cache with fetchRepoData', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await githubService.fetchRepoData('Opndrive', 'opndrive');
    await githubService.fetchStarCount('Opndrive', 'opndrive');

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('singleton', () => {
  it('is the same instance across imports', async () => {
    const again = (await import('./github-service')).githubService;

    // A second instance would mean a second cache and double the API calls,
    // which matters against GitHub's unauthenticated rate limit.
    expect(again).toBe(githubService);
  });
});
