import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credentials } from '@opndrive/s3-api';
import {
  CONNECTIONS_KEY,
  MAX_CONNECTION_NAME_LENGTH,
  defaultConnectionName,
  findConnection,
  inferProviderSlug,
  isSameConnection,
  readConnections,
  refreshConnection,
  addConnection,
  writeConnections,
  type Connection,
} from './connections';

const aws: Credentials = {
  accessKeyId: 'AKIA_A',
  secretAccessKey: 'secret-a',
  bucketName: 'photos',
  prefix: '',
  region: 'us-east-1',
};

const r2: Credentials = {
  accessKeyId: 'R2_KEY',
  secretAccessKey: 'secret-r2',
  bucketName: 'media',
  prefix: '',
  region: 'auto',
  endpoint: 'https://abc123.r2.cloudflarestorage.com',
};

/** The list after adding `creds`, for tests that only care about the list. */
function add(
  list: Connection[],
  creds: Credentials,
  details?: { name?: string; provider?: string }
): Connection[] {
  return addConnection(list, creds, details).list;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('reading and writing the list', () => {
  it('is empty when nothing has been saved', () => {
    expect(readConnections()).toEqual([]);
  });

  it('round-trips what was written', () => {
    const list = add([], aws, { name: 'Personal', provider: 'aws-s3' });

    expect(writeConnections(list)).toBe(true);
    expect(readConnections()).toEqual(list);
    expect(JSON.parse(localStorage.getItem(CONNECTIONS_KEY)!)).toHaveLength(1);
  });

  it('treats unreadable storage as an empty list rather than throwing', () => {
    localStorage.setItem(CONNECTIONS_KEY, '{not json');
    expect(readConnections()).toEqual([]);

    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify({ not: 'a list' }));
    expect(readConnections()).toEqual([]);
  });

  it('drops entries that are not connections and keeps the ones that are', () => {
    const good = add([], aws)[0]!;

    localStorage.setItem(
      CONNECTIONS_KEY,
      JSON.stringify([good, { id: 'x' }, null, { ...good, id: '', name: 'no id' }])
    );

    expect(readConnections()).toEqual([good]);
  });

  it('reports a refused write instead of throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(writeConnections([])).toBe(false);
  });
});

describe('addConnection', () => {
  it('adds a connection with the alias it was given', () => {
    const [saved] = add([], aws, { name: '  Work   account ', provider: 'aws-s3' });

    expect(saved).toMatchObject({
      name: 'Work account',
      provider: 'aws-s3',
      authContext: aws,
    });
    expect(saved!.id).toBeTruthy();
  });

  it('names an unnamed connection after its provider and bucket', () => {
    const [saved] = add([], r2, { provider: 'cloudflare-r2' });

    expect(saved!.name).toBe('Cloudflare R2 - media');
  });

  it('truncates an alias that is far too long', () => {
    const [saved] = add([], aws, { name: 'x'.repeat(500) });

    expect(saved!.name).toHaveLength(MAX_CONNECTION_NAME_LENGTH);
  });

  it('appends an exact duplicate as its own entry, with its own id and name', () => {
    const first = add([], aws, { name: 'Personal' });

    const second = addConnection(first, aws, { name: 'Personal copy' });

    expect(second.list).toHaveLength(2);
    expect(second.list.map((c) => c.name)).toEqual(['Personal', 'Personal copy']);
    expect(second.connection.id).not.toBe(first[0]!.id);
    expect(second.list[0]).toEqual(first[0]);
  });

  it('appends an unnamed duplicate under the default name too', () => {
    const list = add(add([], aws, { provider: 'aws-s3' }), aws, { provider: 'aws-s3' });

    expect(list).toHaveLength(2);
    expect(new Set(list.map((c) => c.id)).size).toBe(2);
  });

  it('appends the same keys on another bucket instead of replacing the first', () => {
    const first = add([], aws, { name: 'Photos' });
    const second = addConnection(first, { ...aws, bucketName: 'backups' }, { name: 'Backups' });

    expect(second.list.map((c) => c.name)).toEqual(['Photos', 'Backups']);
    expect(second.connection.id).not.toBe(first[0]!.id);
    expect(second.list[0]!.authContext.bucketName).toBe('photos');
  });

  it('appends the same keys and bucket under a different folder', () => {
    const list = add(add([], aws), { ...aws, prefix: 'projects/' });

    expect(list).toHaveLength(2);
  });

  it('keeps accounts apart when only the endpoint differs', () => {
    const sameKeyElsewhere = { ...aws, endpoint: 'https://minio.example.com' };

    expect(add(add([], aws), sameKeyElsewhere)).toHaveLength(2);
  });

  it('falls back to an inferred provider when the slug is not one we know', () => {
    const [saved] = add([], r2, { provider: '<script>' });

    expect(saved!.provider).toBe('cloudflare-r2');
  });
});

describe('matching a session to a saved connection', () => {
  it('recognises the same keys, bucket and folder when only the secret or region differ', () => {
    expect(isSameConnection(aws, { ...aws, secretAccessKey: 'rotated', region: 'eu-west-1' })).toBe(
      true
    );
  });

  it('is not the same connection for a different key, bucket or folder', () => {
    expect(isSameConnection(aws, { ...aws, accessKeyId: 'AKIA_B' })).toBe(false);
    expect(isSameConnection(aws, { ...aws, bucketName: 'other' })).toBe(false);
    expect(isSameConnection(aws, { ...aws, prefix: 'x/' })).toBe(false);
  });

  it('finds the connection for exactly the live credentials, and nothing for none', () => {
    const list = add([], aws);

    expect(findConnection(list, { ...aws })).toBe(list[0]);
    expect(findConnection(list, { ...aws, bucketName: 'other' })).toBeUndefined();
    expect(findConnection(list, r2)).toBeUndefined();
    expect(findConnection(list, null)).toBeUndefined();
  });

  it('refreshes a connection by id, onto a bucket that matches nothing yet', () => {
    const list = add([], aws);
    const moved = { ...aws, bucketName: 'other' };

    expect(refreshConnection(list, list[0]!.id, moved)[0]!.authContext).toEqual(moved);
    expect(refreshConnection(list, 'missing', moved)).toEqual(list);
    expect(refreshConnection(list, null, moved)).toEqual(list);
  });
});

describe('inferProviderSlug', () => {
  it.each([
    [{ ...aws }, 'aws-s3'],
    [{ ...aws, endpoint: 'https://s3.eu-west-1.amazonaws.com' }, 'aws-s3'],
    [r2, 'cloudflare-r2'],
    [{ ...aws, endpoint: 'https://s3.eu-west-1.wasabisys.com' }, 'wasabi'],
    [{ ...aws, endpoint: 'https://s3.us-west-004.backblazeb2.com' }, 'backblaze-b2'],
    [{ ...aws, endpoint: 'https://nyc3.digitaloceanspaces.com' }, 'digitalocean-spaces'],
    [{ ...aws, endpoint: 'https://minio.internal:9000' }, 'minio'],
    [{ ...aws, endpoint: 'https://storage.example.com' }, 'custom-endpoint'],
  ])('reads %j as %s', (creds, expected) => {
    expect(inferProviderSlug(creds as Credentials)).toBe(expected);
  });
});

describe('defaultConnectionName', () => {
  it('omits the bucket when there is none', () => {
    expect(defaultConnectionName('minio', { ...aws, bucketName: '' })).toBe('MinIO');
  });
});
