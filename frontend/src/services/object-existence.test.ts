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
import { objectExists, objectKey } from './object-existence';

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
