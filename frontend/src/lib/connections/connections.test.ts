import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credentials } from '@opndrive/s3-api';
import {
  CONNECTIONS_KEY,
  MAX_CONNECTION_NAME_LENGTH,
  accountKey,
  defaultConnectionName,
  findSessionConnection,
  forgetSavedConnections,
  inferProviderSlug,
  isCredentials,
  isSameConnection,
  newConnection,
  readSavedConnections,
  refreshConnection,
  writeSavedConnections,
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

function saved(id: string, name: string, creds: Credentials): Connection {
  return { id, name, provider: 'aws-s3', authContext: creds };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading and writing the record', () => {
  it('is empty, with nothing active, when nothing has been saved', () => {
    expect(readSavedConnections()).toEqual({ activeId: null, connections: [] });
  });

  it('round-trips the list and the active id', () => {
    const record = { activeId: 'a', connections: [saved('a', 'Personal', aws)] };

    expect(writeSavedConnections(record)).toBe(true);
    expect(readSavedConnections()).toEqual(record);
  });

  it('reads the bare array the first version stored, with nothing active', () => {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify([saved('a', 'Personal', aws)]));

    expect(readSavedConnections()).toEqual({
      activeId: null,
      connections: [saved('a', 'Personal', aws)],
    });
  });

  it('drops an active id that names no saved connection', () => {
    localStorage.setItem(
      CONNECTIONS_KEY,
      JSON.stringify({ activeId: 'gone', connections: [saved('a', 'Personal', aws)] })
    );

    expect(readSavedConnections()?.activeId).toBeNull();
  });

  it('treats a corrupt value as an empty record', () => {
    localStorage.setItem(CONNECTIONS_KEY, '{not json');
    expect(readSavedConnections()).toEqual({ activeId: null, connections: [] });
  });

  it('says it cannot see storage (null), rather than "nothing saved", when reading throws', () => {
    // A writer that took this for an empty list would overwrite real entries.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readSavedConnections()).toBeNull();
  });

  it('drops entries that are not connections and keeps the ones that are', () => {
    localStorage.setItem(
      CONNECTIONS_KEY,
      JSON.stringify({
        activeId: null,
        connections: [saved('a', 'Personal', aws), { id: 'x', name: 'broken' }, null, 'text'],
      })
    );

    expect(readSavedConnections()?.connections.map((c) => c.id)).toEqual(['a']);
  });

  it('reports a refused write instead of throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(writeSavedConnections({ activeId: null, connections: [] })).toBe(false);
  });

  it('forgets everything on request', () => {
    writeSavedConnections({ activeId: 'a', connections: [saved('a', 'Personal', aws)] });
    forgetSavedConnections();

    expect(localStorage.getItem(CONNECTIONS_KEY)).toBeNull();
  });
});

describe('isCredentials', () => {
  it('accepts the stored session shape and rejects anything missing a key, secret or region', () => {
    expect(isCredentials(aws)).toBe(true);
    expect(isCredentials({ ...aws, region: undefined })).toBe(false);
    expect(isCredentials({ accessKeyId: 'a' })).toBe(false);
    expect(isCredentials(null)).toBe(false);
  });
});

describe('newConnection', () => {
  it('takes the alias it was given', () => {
    const connection = newConnection(aws, { name: '  Personal   photos ', provider: 'aws-s3' });

    expect(connection.name).toBe('Personal photos');
    expect(connection.provider).toBe('aws-s3');
    expect(connection.authContext).toBe(aws);
    expect(connection.id).not.toBe('');
  });

  it('names an unnamed connection after its provider and bucket', () => {
    expect(newConnection(r2).name).toBe('Cloudflare R2 - media');
  });

  it('truncates an alias that is far too long', () => {
    const connection = newConnection(aws, { name: 'x'.repeat(200) });
    expect(connection.name).toHaveLength(MAX_CONNECTION_NAME_LENGTH);
  });

  it('gives an exact duplicate its own id: adds are never merged', () => {
    expect(newConnection(aws).id).not.toBe(newConnection(aws).id);
  });

  it('falls back to an inferred provider when the slug is not one we know', () => {
    expect(newConnection(r2, { provider: 'not-a-provider' }).provider).toBe('cloudflare-r2');
  });
});

describe('isSameConnection', () => {
  it('is the same only when every part that decides what is reached matches', () => {
    expect(isSameConnection(aws, { ...aws })).toBe(true);
    expect(isSameConnection(aws, { ...aws, secretAccessKey: 'other' })).toBe(false);
    expect(isSameConnection(aws, { ...aws, region: 'eu-west-1' })).toBe(false);
    expect(isSameConnection(aws, { ...aws, bucketName: 'other' })).toBe(false);
    expect(isSameConnection(aws, { ...aws, prefix: 'folder/' })).toBe(false);
    expect(isSameConnection(aws, { ...aws, endpoint: 'https://example.com' })).toBe(false);
  });
});

describe('findSessionConnection', () => {
  const personal = saved('p', 'Personal', aws);
  // The same keys moved to the same bucket: identical credentials, another name.
  const work = saved('w', 'Work', { ...aws });

  it('trusts the recorded active id when its entry holds exactly the session', () => {
    expect(findSessionConnection({ activeId: 'w', connections: [personal, work] }, aws)).toBe(work);
  });

  it('falls back to the first exact match when the recorded entry does not match', () => {
    const moved = saved('w', 'Work', { ...aws, bucketName: 'work' });
    expect(findSessionConnection({ activeId: 'w', connections: [personal, moved] }, aws)).toBe(
      personal
    );
  });

  it('does not take an entry holding an old secret for the same key', () => {
    const old = saved('o', 'Old', { ...aws, secretAccessKey: 'rotated-away' });
    expect(findSessionConnection({ activeId: null, connections: [old] }, aws)).toBeUndefined();
  });
});

describe('refreshConnection', () => {
  it('moves a connection by id, onto a bucket that matches nothing yet', () => {
    const list = [saved('a', 'Personal', aws), saved('b', 'Media', r2)];
    const moved = refreshConnection(list, 'a', { ...aws, bucketName: 'archive' });

    expect(moved[0]!.authContext.bucketName).toBe('archive');
    expect(moved[1]).toBe(list[1]);
  });

  it('changes nothing without an id', () => {
    const list = [saved('a', 'Personal', aws)];
    expect(refreshConnection(list, null, r2)).toEqual(list);
  });
});

describe('accountKey', () => {
  it('names the account by endpoint and access key, never the secret', () => {
    expect(accountKey(aws)).toBe('|AKIA_A');
    expect(accountKey(r2)).toBe('https://abc123.r2.cloudflarestorage.com|R2_KEY');
    expect(accountKey(r2)).not.toContain('secret');
  });

  it('tells apart the same bucket name in two accounts', () => {
    expect(accountKey({ ...aws, endpoint: 'https://minio-1.local' })).not.toBe(
      accountKey({ ...aws, endpoint: 'https://minio-2.local' })
    );
  });
});

describe('inferProviderSlug', () => {
  it.each([
    [undefined, 'aws-s3'],
    ['https://abc.r2.cloudflarestorage.com', 'cloudflare-r2'],
    ['https://s3.eu-central-1.wasabisys.com', 'wasabi'],
    ['https://s3.us-west-002.backblazeb2.com', 'backblaze-b2'],
    ['https://nyc3.digitaloceanspaces.com', 'digitalocean-spaces'],
    ['https://s3.eu-west-1.amazonaws.com', 'aws-s3'],
    ['https://minio.example.com:9000', 'minio'],
    ['minio-1.local:9000', 'minio'],
    ['https://storage.example.com', 'custom-endpoint'],
  ])('reads %s as %s', (endpoint, slug) => {
    expect(inferProviderSlug({ ...aws, endpoint })).toBe(slug);
  });

  it.each([
    // A provider's domain inside another host, or in the path or query, is not that provider.
    ['https://s3.amazonaws.com.evil.example', 'custom-endpoint'],
    ['https://gateway.example.com/r2.cloudflarestorage.com', 'custom-endpoint'],
    ['https://files.example.net/?next=wasabisys.com', 'custom-endpoint'],
    ['https://notbackblazeb2.com', 'custom-endpoint'],
    // Letters that merely contain "minio" are not MinIO.
    ['https://dominion.example.com', 'custom-endpoint'],
    ['not a url at all', 'custom-endpoint'],
  ])('does not mistake %s for a known provider', (endpoint, slug) => {
    expect(inferProviderSlug({ ...aws, endpoint })).toBe(slug);
  });
});

describe('defaultConnectionName', () => {
  it('omits the bucket when there is none', () => {
    expect(defaultConnectionName('aws-s3', { ...aws, bucketName: '' })).toBe('Amazon S3');
  });

  it('stays within the length limit for a long bucket name', () => {
    expect(defaultConnectionName('aws-s3', { ...aws, bucketName: 'b'.repeat(80) })).toHaveLength(
      MAX_CONNECTION_NAME_LENGTH
    );
  });
});
