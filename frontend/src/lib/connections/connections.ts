import type { Credentials } from '@opndrive/s3-api';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';

/**
 * Saved connections: every storage account this browser can switch between.
 *
 * `s3_user_session` stays the credentials the app is working in right now.
 * `s3_connections` holds the list the user has added, and which entry of that
 * list the session belongs to, as one record:
 *
 *   { "activeId": "<id>" | null, "connections": [ ... ] }
 *
 * Keeping the active id in storage, rather than working it out on a reload by
 * matching credentials, is what keeps names attached to the right account: two
 * entries can share keys, and a bucket switch can make two entries identical.
 * A credential match is only the fallback, for a record that predates the id or
 * whose id no longer matches the session.
 *
 * Every write re-reads the stored record first, so a tab that loaded earlier
 * cannot overwrite what another tab added since.
 *
 * Everything here is synchronous and storage-tolerant. A browser that refuses
 * site data, or a record edited by hand into nonsense, yields `null` or an
 * empty list rather than an exception - the app must keep working on the
 * session it has.
 */

export const CONNECTIONS_KEY = 's3_connections';

/** Provider slug used when nothing better is known; the "custom endpoint" mark. */
const FALLBACK_PROVIDER = 'custom-endpoint';

/** Longest alias kept. The switcher ellipsises, but storage should not hold essays. */
export const MAX_CONNECTION_NAME_LENGTH = 60;

export interface Connection {
  /** Stable handle for the list. Not a secret and not derived from one. */
  id: string;
  /** The alias shown in the switcher. */
  name: string;
  /** A provider slug from the registry, used to pick the icon. */
  provider: string;
  /**
   * The same shape `s3_user_session` stores. Holds the bucket the connection was
   * last on, so switching back returns you to where you were.
   */
  authContext: Credentials;
}

/** The stored record: the list, and which entry the session is on. */
export interface SavedConnections {
  activeId: string | null;
  connections: Connection[];
}

export const EMPTY_SAVED_CONNECTIONS: SavedConnections = { activeId: null, connections: [] };

/**
 * The shape both `s3_user_session` and a saved entry must have before anything
 * is built on it. One check for both, so they cannot drift.
 */
export function isCredentials(value: unknown): value is Credentials {
  const c = value as Credentials | null;

  return (
    typeof c?.accessKeyId === 'string' &&
    typeof c?.secretAccessKey === 'string' &&
    typeof c?.region === 'string'
  );
}

function isConnection(value: unknown): value is Connection {
  const c = value as Connection | null;

  return (
    typeof c?.id === 'string' &&
    c.id !== '' &&
    typeof c?.name === 'string' &&
    typeof c?.provider === 'string' &&
    isCredentials(c?.authContext)
  );
}

/**
 * Whether two sets of credentials are the same in every part that decides what
 * they reach: keys, secret, region, endpoint, bucket and folder.
 */
export function isSameConnection(a: Credentials, b: Credentials): boolean {
  return (
    a.accessKeyId === b.accessKeyId &&
    a.secretAccessKey === b.secretAccessKey &&
    a.region === b.region &&
    (a.endpoint ?? '') === (b.endpoint ?? '') &&
    (a.bucketName ?? '') === (b.bucketName ?? '') &&
    (a.prefix ?? '') === (b.prefix ?? '')
  );
}

/**
 * Which storage account these credentials reach: the endpoint and the access
 * key, never the secret. Bucket names are only unique within an account (or a
 * self-hosted server), so anything remembered per bucket - an interrupted
 * delete, say - has to be remembered per account too, now that one browser
 * can hold several.
 */
export function accountKey(creds: Pick<Credentials, 'accessKeyId' | 'endpoint'>): string {
  return `${(creds.endpoint ?? '').trim().toLowerCase()}|${creds.accessKeyId}`;
}

/**
 * The stored record, or null when storage cannot be read at all. An absent or
 * unreadable value is an empty record; only a refusal to read is null, so a
 * writer can tell "nothing saved" from "cannot see what is saved".
 */
export function readSavedConnections(): SavedConnections | null {
  let raw: string | null;

  try {
    raw = localStorage.getItem(CONNECTIONS_KEY);
  } catch {
    return null;
  }

  if (!raw) return { ...EMPTY_SAVED_CONNECTIONS, connections: [] };

  try {
    const parsed: unknown = JSON.parse(raw);

    // The first version of this feature stored a bare array, with no active id.
    if (Array.isArray(parsed)) {
      return { activeId: null, connections: parsed.filter(isConnection) };
    }

    const record = parsed as Partial<SavedConnections> | null;
    const connections = Array.isArray(record?.connections)
      ? record.connections.filter(isConnection)
      : [];
    const activeId =
      typeof record?.activeId === 'string' && connections.some((c) => c.id === record.activeId)
        ? record.activeId
        : null;

    return { activeId, connections };
  } catch {
    return { ...EMPTY_SAVED_CONNECTIONS, connections: [] };
  }
}

/** Writes the record. Returns whether it landed; a refusal is not fatal to the caller. */
export function writeSavedConnections(saved: SavedConnections): boolean {
  try {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(saved));
    return true;
  } catch (error) {
    console.warn(
      '[opndrive] Your saved connections could not be stored in this browser. ' +
        'The connection in use is unaffected, but the list will not survive a reload.',
      error
    );
    return false;
  }
}

/** Forgets every saved connection and its keys. */
export function forgetSavedConnections(): void {
  try {
    localStorage.removeItem(CONNECTIONS_KEY);
  } catch {
    // Unreadable storage holds nothing this page can remove.
  }
}

export function newConnectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Host suffixes that identify a provider. Matched against the parsed hostname only. */
const PROVIDER_HOSTS: ReadonlyArray<readonly [suffix: string, slug: string]> = [
  ['r2.cloudflarestorage.com', 'cloudflare-r2'],
  ['wasabisys.com', 'wasabi'],
  ['backblazeb2.com', 'backblaze-b2'],
  ['digitaloceanspaces.com', 'digitalocean-spaces'],
  ['amazonaws.com', 'aws-s3'],
];

/** The endpoint's hostname, lower-cased, or '' when it is not a URL. */
function endpointHost(endpoint: string): string {
  try {
    // A bare host ("minio.example.com:9000") is a URL once given a scheme.
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`
    );
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Best guess at the provider from the endpoint, for connections made before
 * this list existed (which never recorded one). It decides the icon and the
 * default name, which is the user's cue to which service the keys go to, so it
 * reads the endpoint's hostname and requires the provider's domain to be that
 * host or end it ("s3.amazonaws.com.example.net" is not AWS, and neither is a
 * provider's domain in the path or query).
 */
export function inferProviderSlug(creds: Credentials): string {
  const endpoint = (creds.endpoint ?? '').trim();

  if (!endpoint) return 'aws-s3';

  const host = endpointHost(endpoint);
  if (!host) return FALLBACK_PROVIDER;

  for (const [suffix, slug] of PROVIDER_HOSTS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return slug;
  }

  // Self-hosted MinIO has no fixed domain; a host label named for it is the
  // best there is ("minio.example.com", "minio-1.local"), not any host that
  // merely contains the letters.
  if (host.split('.').some((label) => /^minio(?:$|[-\d])/.test(label))) return 'minio';

  return FALLBACK_PROVIDER;
}

/** An alias when the user did not type one: "Amazon S3 - my-bucket". */
export function defaultConnectionName(
  providerSlug: string,
  creds: Pick<Credentials, 'bucketName'>
): string {
  const providerName = getProviderBySlug(providerSlug)?.name ?? 'Storage';
  const bucket = creds.bucketName?.trim();

  return normaliseConnectionName(bucket ? `${providerName} - ${bucket}` : providerName);
}

export function normaliseConnectionName(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_CONNECTION_NAME_LENGTH);
}

/** A slug the registry knows, or the inferred one. Keeps a bad value out of storage. */
function knownProvider(slug: string | undefined, creds: Credentials): string {
  if (slug && S3_PROVIDERS.some((provider) => provider.slug === slug)) return slug;

  return inferProviderSlug(creds);
}

export interface ConnectionDetails {
  name?: string;
  provider?: string;
}

/**
 * A new saved entry. Always new: there is no deduplication, so adding exactly
 * the same keys, bucket and folder again gives a second entry, which is what
 * someone adding it twice asked for.
 */
export function newConnection(creds: Credentials, details: ConnectionDetails = {}): Connection {
  const provider = knownProvider(details.provider, creds);

  return {
    id: newConnectionId(),
    name: normaliseConnectionName(details.name) || defaultConnectionName(provider, creds),
    provider,
    authContext: creds,
  };
}

/**
 * Updates the saved credentials of the connection with this id, if there is one.
 *
 * By id and not by matching the credentials: the point is to record that the
 * connection has moved to another bucket, and the new bucket matches nothing.
 */
export function refreshConnection(
  list: readonly Connection[],
  id: string | null,
  creds: Credentials
): Connection[] {
  if (id === null) return [...list];

  return list.map((entry) => (entry.id === id ? { ...entry, authContext: creds } : entry));
}

/**
 * The saved entry the stored session belongs to.
 *
 * The recorded active id wins whenever its entry still holds exactly these
 * credentials. Otherwise the first entry that does, which only matters for a
 * record written before the id was stored, or a session written without its
 * record (a storage refusal, or a tab closed between the two writes).
 */
export function findSessionConnection(
  saved: SavedConnections,
  creds: Credentials
): Connection | undefined {
  const recorded = saved.connections.find((entry) => entry.id === saved.activeId);
  if (recorded && isSameConnection(recorded.authContext, creds)) return recorded;

  return saved.connections.find((entry) => isSameConnection(entry.authContext, creds));
}
