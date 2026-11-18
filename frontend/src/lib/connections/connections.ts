import type { Credentials } from '@opndrive/s3-api';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';

/**
 * Saved connections: every storage account this browser can switch between.
 *
 * `s3_user_session` stays the single source of truth for the connection the app
 * is working in right now. This list is only what the user has added over time,
 * so the switcher has somewhere to switch *to*.
 *
 * Every add is appended, whatever it matches: the same keys on another bucket,
 * or an exact duplicate, are separate entries. Which saved entry is live is
 * tracked by id in the auth context while the app runs; `findConnection`
 * recovers it from the stored session on a reload, which works because the saved
 * copy is kept in step with the session on every bucket switch.
 *
 * Everything here is synchronous and storage-tolerant. A browser that refuses
 * site data, or a list that was edited by hand into nonsense, yields an empty
 * list rather than an exception - the app must keep working on the session it
 * has.
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
  /** A provider slug from the registry, used only to pick the icon. */
  provider: string;
  /**
   * The same shape `s3_user_session` stores. Holds the bucket the connection was
   * last on, so switching back returns you to where you were.
   */
  authContext: Credentials;
}

function isCredentials(value: unknown): value is Credentials {
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
 * Whether two sets of credentials point at the same keys, bucket and folder.
 *
 * Used only to recognise the stored session among the saved entries on a
 * reload. It is never used to refuse or merge an add: identical connections are
 * allowed to coexist.
 */
export function isSameConnection(a: Credentials, b: Credentials): boolean {
  return (
    a.accessKeyId === b.accessKeyId &&
    (a.endpoint ?? '') === (b.endpoint ?? '') &&
    a.bucketName === b.bucketName &&
    (a.prefix ?? '') === (b.prefix ?? '')
  );
}

export function readConnections(): Connection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isConnection);
  } catch {
    return [];
  }
}

/** Writes the list. Returns whether it landed; a refusal is not fatal to the caller. */
export function writeConnections(connections: readonly Connection[]): boolean {
  try {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
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

export function newConnectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Best guess at the provider from the endpoint, for connections made before
 * this list existed (which never recorded one). Only decides which icon is
 * drawn, so a wrong answer costs a logo and nothing else.
 */
export function inferProviderSlug(creds: Credentials): string {
  const endpoint = (creds.endpoint ?? '').toLowerCase();

  if (!endpoint) return 'aws-s3';
  if (endpoint.includes('r2.cloudflarestorage.com')) return 'cloudflare-r2';
  if (endpoint.includes('wasabisys.com')) return 'wasabi';
  if (endpoint.includes('backblazeb2.com')) return 'backblaze-b2';
  if (endpoint.includes('digitaloceanspaces.com')) return 'digitalocean-spaces';
  if (endpoint.includes('amazonaws.com')) return 'aws-s3';
  if (endpoint.includes('minio')) return 'minio';

  return FALLBACK_PROVIDER;
}

/** An alias when the user did not type one: "Amazon S3 - my-bucket". */
export function defaultConnectionName(providerSlug: string, creds: Credentials): string {
  const providerName = getProviderBySlug(providerSlug)?.name ?? 'Storage';
  const bucket = creds.bucketName?.trim();

  return bucket ? `${providerName} - ${bucket}` : providerName;
}

export function normaliseConnectionName(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_CONNECTION_NAME_LENGTH);
}

/** A slug the registry knows, or the fallback. Keeps a bad value out of storage. */
function knownProvider(slug: string | undefined, creds: Credentials): string {
  if (slug && S3_PROVIDERS.some((provider) => provider.slug === slug)) return slug;

  return inferProviderSlug(creds);
}

export interface ConnectionDetails {
  name?: string;
  provider?: string;
}

/**
 * Appends a connection. Always: there is no deduplication, so adding exactly
 * the same keys, bucket and folder again gives a second entry, which is what
 * someone adding it twice asked for. Returns the new list and the entry added,
 * so the caller knows which one is now live.
 */
export function addConnection(
  list: readonly Connection[],
  creds: Credentials,
  details: ConnectionDetails = {}
): { list: Connection[]; connection: Connection } {
  const provider = knownProvider(details.provider, creds);
  const connection: Connection = {
    id: newConnectionId(),
    name: normaliseConnectionName(details.name) || defaultConnectionName(provider, creds),
    provider,
    authContext: creds,
  };

  return { list: [...list, connection], connection };
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
 * The saved connection for exactly these credentials, if any. With identical
 * entries the first is returned; they differ only by name, so which is marked
 * live after a reload is cosmetic.
 */
export function findConnection(
  list: readonly Connection[],
  creds: Credentials | null
): Connection | undefined {
  return creds ? list.find((entry) => isSameConnection(entry.authContext, creds)) : undefined;
}
