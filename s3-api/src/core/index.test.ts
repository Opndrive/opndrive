/**
 * `BaseS3ApiProvider` mechanics: how the S3Client gets configured from
 * credentials, and the debugLog switch.
 *
 * The client config is what decides retry behaviour and addressing style for
 * every call the package makes, so it is worth pinning explicitly rather than
 * inferring it from a downstream request. Most v3 config fields resolve to
 * async providers, hence the awaits.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BYOS3ApiProvider } from '../index.js';
import type { Credentials, logTypes } from './types.js';

const creds: Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucketName: 'test-bucket',
  prefix: 'users/alice/',
  region: 'eu-west-2',
};

function makeApi(overrides: Partial<Credentials> = {}) {
  return new BYOS3ApiProvider({ ...creds, ...overrides }, 'BYO');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('S3Client construction', () => {
  it('builds the client from the supplied region and credentials', async () => {
    const config = makeApi().getS3Client().config;

    expect(await config.region()).toBe('eu-west-2');
    expect(await config.credentials()).toMatchObject({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
  });

  it('raises maxAttempts to 5 and retries only at this layer', async () => {
    const config = makeApi().getS3Client().config;

    // Bulk operations (renameFolder, deleteBatch) issue thousands of requests.
    // The SDK's own strategy already backs off on throttling and 5xx, so this
    // is the ONLY retry layer - a second one around send() would multiply
    // attempts and fight the SDK's rate limiter.
    expect(await config.maxAttempts()).toBe(5);
  });

  it('computes checksums only when the operation requires them', async () => {
    const config = makeApi().getS3Client().config;

    // Full-body checksums on every request break some S3-compatible services
    // and cost throughput on large uploads.
    expect(await config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
    expect(await config.responseChecksumValidation()).toBe('WHEN_REQUIRED');
  });

  it('uses virtual-host addressing when no custom endpoint is given', () => {
    const config = makeApi().getS3Client().config;

    // The SDK resolves the unset flag to an explicit false.
    expect(config.forcePathStyle).toBe(false);
  });

  it('switches to path-style addressing for a custom endpoint', async () => {
    const config = makeApi({ endpoint: 'https://minio.example.com:9000' }).getS3Client().config;

    // MinIO and friends rarely support virtual-host buckets, so setting an
    // endpoint has to flip addressing too or every request 404s.
    expect(config.forcePathStyle).toBe(true);
    expect(await config.endpoint!()).toMatchObject({
      hostname: 'minio.example.com',
      port: 9000,
    });
  });

  it('gives each provider its own client instance', () => {
    // The upload managers hold onto a client across a session; sharing one
    // between two providers would let a disposed session's client leak into
    // the next one.
    expect(makeApi().getS3Client()).not.toBe(makeApi().getS3Client());
  });
});

describe('accessors', () => {
  it('exposes the credentials the provider was built with', () => {
    const api = makeApi();

    expect(api.getBucketName()).toBe('test-bucket');
    expect(api.getPrefix()).toBe('users/alice/');
    expect(api.getRegion()).toBe('eu-west-2');
  });

  it('returns the same client instance on every call', () => {
    const api = makeApi();

    expect(api.getS3Client()).toBe(api.getS3Client());
  });

  it('reports an empty prefix as empty rather than substituting a default', () => {
    // The dashboard treats '' as "bucket root"; a silent default would trap
    // the user inside a prefix they never configured.
    expect(makeApi({ prefix: '' }).getPrefix()).toBe('');
  });
});

describe('debugLog', () => {
  it('prefixes every entry with an ISO timestamp and the user type', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    makeApi().debugLog('BYO', 'log', 'hello');

    expect(log.mock.calls[0]![0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[BYO-S3\]:$/
    );
  });

  it('routes "log" to console.log with the message and data', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    makeApi().debugLog('BYO', 'log', 'listing done', null, { count: 3 });

    expect(log).toHaveBeenCalledTimes(2); // header + payload
    expect(log.mock.calls[1]).toEqual(['listing done', { count: 3 }, '\n']);
  });

  it('routes "error" to console.error and ignores the message', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');

    makeApi().debugLog('BYO', 'error', 'this message is not printed', boom);

    expect(error).toHaveBeenCalledExactlyOnceWith(boom, '\n');
  });

  it('routes "warn" to console.warn', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    makeApi().debugLog('BYO', 'warn', 'slow down');

    expect(warn).toHaveBeenCalledExactlyOnceWith('slow down', '\n');
  });

  it('routes "table" to console.table with the data', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
    const rows = [{ key: 'a.txt' }];

    makeApi().debugLog('BYO', 'table', undefined, undefined, rows);

    expect(table).toHaveBeenCalledExactlyOnceWith(rows);
    expect(log).toHaveBeenCalledTimes(2); // header + trailing blank line
  });

  it('routes "dir" to console.dir with unlimited depth', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = vi.spyOn(console, 'dir').mockImplementation(() => {});
    const nested = { a: { b: { c: { d: 1 } } } };

    makeApi().debugLog('BYO', 'dir', undefined, undefined, nested);

    // Node truncates at depth 2 by default, which hides exactly the nested
    // response shapes this is used to inspect.
    expect(dir).toHaveBeenCalledExactlyOnceWith(nested, { depth: null });
  });

  it('prints only the header for an unrecognised log type', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    makeApi().debugLog('BYO', 'nonsense' as logTypes, 'ignored');

    // No switch arm matches, so nothing beyond the header is emitted - and it
    // must not throw.
    expect(log).toHaveBeenCalledOnce();
  });

  it('tolerates being called with no message, error, or data', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => makeApi().debugLog('BYO', 'warn')).not.toThrow();
    expect(warn).toHaveBeenCalledExactlyOnceWith(undefined, '\n');
  });
});
