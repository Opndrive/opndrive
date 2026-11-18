/**
 * Object existence check.
 *
 * The sibling of `folderExists`, and held to the same rule: it answers yes or
 * no, or it throws. It must never answer "no" because it could not find out.
 *
 * That rule was written down long before it was true. This used to go through
 * `fetchMetadata`, which returns null for a missing object and for every other
 * failure alike - so a HEAD the provider refused, throttled or never answered
 * came back as "nothing there", and the upload wrote over whatever was.
 */

import { describe, it, expect, vi } from 'vitest';
import { BYOS3ApiProvider } from '@opndrive/s3-api';
import { findExistingNames, objectExists, objectKey } from './object-existence';

function fakeApi(exists = vi.fn(async (_key: string) => false)) {
  return { objectExists: exists } as unknown as BYOS3ApiProvider & { objectExists: typeof exists };
}

describe('objectExists', () => {
  it('asks about exactly the key it was given', async () => {
    const api = fakeApi();

    await objectExists(api, 'docs/report.pdf');

    expect(api.objectExists).toHaveBeenCalledExactlyOnceWith('docs/report.pdf');
  });

  it('reports true when the object is there', async () => {
    const api = fakeApi(vi.fn(async () => true));

    await expect(objectExists(api, 'docs/report.pdf')).resolves.toBe(true);
  });

  it('reports false when it is not', async () => {
    await expect(objectExists(fakeApi(), 'docs/report.pdf')).resolves.toBe(false);
  });

  it('propagates a failed check instead of answering false', async () => {
    const api = fakeApi(
      vi.fn(async () => {
        throw new Error('AccessDenied');
      })
    );

    // Answering "false" here is what let an upload overwrite a file it was
    // never able to look for.
    await expect(objectExists(api, 'docs/report.pdf')).rejects.toThrow('AccessDenied');
  });
});

/**
 * The tests above only prove the wrapper passes an answer along. These prove
 * the answer it is handed is an honest one, by running the real provider with
 * nothing replaced but the wire.
 *
 * That seam is where the bug lived. Every test of the upload flow mocked this
 * function to reject, which exercised the "could not check" branch perfectly -
 * while the real function underneath could never reject at all.
 */
describe('objectExists, through the real provider', () => {
  function providerAnswering(send: (command: unknown) => Promise<unknown>) {
    const api = new BYOS3ApiProvider(
      {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        region: 'us-east-1',
        bucketName: 'test-bucket',
        prefix: '',
      },
      'BYO'
    );

    // Only the wire. The provider builds the command and reads the outcome
    // exactly as it does in the app.
    api.getS3Client().send = send as never;

    return api;
  }

  it('reports true when the object answers', async () => {
    const api = providerAnswering(async () => ({ ContentLength: 10 }));

    await expect(objectExists(api, 'docs/report.pdf')).resolves.toBe(true);
  });

  it('throws when the provider refuses the lookup', async () => {
    // What a key without permission to read the object gets back. A HEAD
    // carries no body, so the status is all there is.
    const refused = Object.assign(new Error('Forbidden'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    const api = providerAnswering(async () => {
      throw refused;
    });

    await expect(objectExists(api, 'docs/report.pdf')).rejects.toBe(refused);
  });

  it('throws when the request never completes', async () => {
    // A blocked cross-origin HEAD and a dropped connection both look like
    // this from a browser: no status, no body.
    const unreachable = new TypeError('Failed to fetch');
    const api = providerAnswering(async () => {
      throw unreachable;
    });

    await expect(objectExists(api, 'docs/report.pdf')).rejects.toBe(unreachable);
  });
});

describe('objectKey', () => {
  it('joins a prefix and a name', () => {
    expect(objectKey('docs/', 'report.pdf')).toBe('docs/report.pdf');
  });

  it('adds the slash a prefix is missing', () => {
    expect(objectKey('docs', 'report.pdf')).toBe('docs/report.pdf');
  });

  it('treats the bucket root as no prefix at all', () => {
    expect(objectKey('', 'report.pdf')).toBe('report.pdf');
    expect(objectKey('/', 'report.pdf')).toBe('report.pdf');
  });

  it('drops a leading slash, which S3 would store as an empty folder name', () => {
    expect(objectKey('/docs/', 'report.pdf')).toBe('docs/report.pdf');
  });
});

/**
 * Checking many names against one listing.
 *
 * The rule that matters most: a name is only ever reported free when the
 * listing has been read to its end. Anything short of that is "could not
 * rule it out", because the alternative is an overwrite.
 */
describe('findExistingNames', () => {
  type Page = { keys: string[]; next?: string };

  /** A provider whose listing serves `pages` in order, keyed by token. */
  function listingApi(pages: Page[]) {
    const byToken = new Map(pages.map((page, i) => [i === 0 ? undefined : String(i), page]));
    const fetchDirectoryStructure = vi.fn(
      async (_prefix: string, _maxKeys: number, token?: string) => {
        const page = byToken.get(token)!;
        return {
          files: page.keys.map((Key) => ({ Key })),
          folders: [],
          nextToken: page.next,
          isTruncated: page.next !== undefined,
        };
      }
    );
    return {
      api: { fetchDirectoryStructure } as unknown as BYOS3ApiProvider,
      fetchDirectoryStructure,
    };
  }

  it('answers every name from a listing that fits in one page', async () => {
    const { api, fetchDirectoryStructure } = listingApi([{ keys: ['docs/a.txt', 'docs/c.txt'] }]);

    const result = await findExistingNames(api, 'docs', ['a.txt', 'b.txt', 'c.txt'], 5);

    expect(result).toEqual({ existing: new Set(['a.txt', 'c.txt']), unknown: [] });
    expect(fetchDirectoryStructure).toHaveBeenCalledExactlyOnceWith('docs/', 1000, undefined);
  });

  it('reads on through every page until the listing ends', async () => {
    const { api, fetchDirectoryStructure } = listingApi([
      { keys: ['a.txt'], next: '1' },
      { keys: ['m.txt'], next: '2' },
      { keys: ['z.txt'] },
    ]);

    const result = await findExistingNames(api, '', ['a.txt', 'z.txt', 'new.txt'], 10);

    expect(result).toEqual({ existing: new Set(['a.txt', 'z.txt']), unknown: [] });
    expect(fetchDirectoryStructure.mock.calls.map((call) => call[2])).toEqual([
      undefined,
      '1',
      '2',
    ]);
  });

  it('leaves unknown whatever it did not find when the page budget runs out', async () => {
    const { api, fetchDirectoryStructure } = listingApi([
      { keys: ['a.txt'], next: '1' },
      { keys: ['m.txt'], next: '2' },
      { keys: ['z.txt'] },
    ]);

    const result = await findExistingNames(api, '', ['a.txt', 'b.txt', 'z.txt'], 2);

    // b.txt sorts before m.txt, so a sorted listing would have shown it by
    // now. Not every bucket lists in order, so it stays unknown all the same.
    expect(result).toEqual({ existing: new Set(['a.txt']), unknown: ['b.txt', 'z.txt'] });
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(2);
  });

  it('matches whole names directly under the prefix only', async () => {
    const { api } = listingApi([{ keys: ['docs/a.txt.bak', 'docs/xa.txt'] }]);

    const result = await findExistingNames(api, 'docs/', ['a.txt'], 1);

    expect(result.existing).toEqual(new Set());
  });

  it('lists the bucket root for an empty prefix', async () => {
    const { api, fetchDirectoryStructure } = listingApi([{ keys: ['a.txt'] }]);

    await findExistingNames(api, '', ['a.txt'], 1);

    expect(fetchDirectoryStructure.mock.calls[0]![0]).toBe('');
  });

  it('leaves unknown what it did not find when a page says there is more but not how to get it', async () => {
    // S3 always sends the token with a truncated page; a service that does
    // not has said the listing is incomplete all the same. Read as finished,
    // every name past that page looked free, and was overwritten.
    const fetchDirectoryStructure = vi.fn(async () => ({
      files: [{ Key: 'a.txt' }],
      folders: [],
      nextToken: undefined,
      isTruncated: true,
    }));
    const api = { fetchDirectoryStructure } as unknown as BYOS3ApiProvider;

    const result = await findExistingNames(api, '', ['a.txt', 'b.txt'], 5);

    expect(result).toEqual({ existing: new Set(['a.txt']), unknown: ['b.txt'] });
    expect(fetchDirectoryStructure).toHaveBeenCalledTimes(1);
  });

  it('follows a token even from a page that does not say it is truncated', async () => {
    // Either sign of more to come counts. Following it costs one page at
    // most; ignoring it could call a name free that is on the next one.
    const pages = [
      { files: [{ Key: 'a.txt' }], folders: [], nextToken: '1', isTruncated: undefined },
      { files: [{ Key: 'b.txt' }], folders: [], nextToken: undefined, isTruncated: false },
    ];
    const fetchDirectoryStructure = vi.fn(async (_p: string, _m: number, token?: string) =>
      token ? pages[1]! : pages[0]!
    );
    const api = { fetchDirectoryStructure } as unknown as BYOS3ApiProvider;

    const result = await findExistingNames(api, '', ['a.txt', 'b.txt', 'c.txt'], 5);

    expect(result).toEqual({ existing: new Set(['a.txt', 'b.txt']), unknown: [] });
  });

  it('propagates a failed listing instead of calling the names free', async () => {
    const api = {
      fetchDirectoryStructure: vi.fn(async () => {
        throw new Error('AccessDenied');
      }),
    } as unknown as BYOS3ApiProvider;

    await expect(findExistingNames(api, 'docs', ['a.txt'], 3)).rejects.toThrow('AccessDenied');
  });
});
