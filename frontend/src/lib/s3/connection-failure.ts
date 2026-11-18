/**
 * What went wrong talking to a bucket, in terms a user can act on.
 *
 * Every S3 surface needs this same mapping, and before this it did not exist:
 * the vocabulary was scattered across preview, delete, rename and search, each
 * deciding for itself what an error meant, and the directory store threw the
 * error away entirely with a bare `catch {}`. So a wrong secret key, a bucket
 * that does not exist and a missing CORS rule all reached the screen as the
 * same nothing.
 *
 * The distinction that matters is not severity, it is *whose problem it is and
 * where the fix lives*. Wrong keys are fixed on /connect. A missing CORS rule
 * is fixed in the provider's console, and the setup guide already explains how.
 * A network drop is fixed by trying again. Collapsing those into one "something
 * went wrong" sends people to the wrong place.
 */

export type ConnectionFailureKind =
  /** The key or secret is wrong. Nothing about the bucket was reached. */
  | 'credentials'
  /** The key is real, but its policy does not allow this. */
  | 'permissions'
  /** Authenticated fine, but the bucket is not there under this region. */
  | 'bucket'
  /** The request never completed. In a browser this is usually CORS. */
  | 'network'
  /** Genuinely unrecognised. Says so rather than guessing. */
  | 'unknown';

/**
 * The heading shown for each kind of failure.
 *
 * Exported because the troubleshooting section on every /connect page quotes
 * these word for word, and a quote that drifts from the screen it describes is
 * worse than none. Both read from here.
 */
export const CONNECTION_FAILURE_TITLES: Record<ConnectionFailureKind, string> = {
  network: 'Could not reach your storage',
  credentials: 'Those keys were rejected',
  bucket: 'That bucket was not found',
  permissions: 'These keys are not allowed to do that',
  unknown: 'Something went wrong reaching your storage',
};

export interface ConnectionFailure {
  kind: ConnectionFailureKind;
  /** Short enough to be a heading. */
  title: string;
  /** One or two sentences naming the likely fix. */
  detail: string;
  /**
   * Whether trying the same request again could plausibly work. False for the
   * failures that need a change somewhere else first - retrying a wrong secret
   * key just fails again, and a button that does nothing is worse than no
   * button.
   */
  retryable: boolean;
  /** The original throw, kept for logging. Never rendered. */
  cause?: unknown;
}

/** Error names S3 uses when the signature or key id does not check out. */
const CREDENTIAL_ERRORS = new Set([
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'InvalidClientTokenId',
  'UnrecognizedClientException',
  'AuthorizationHeaderMalformed',
  'TokenRefreshRequired',
  'ExpiredToken',
]);

/** Names that mean the caller is known but not allowed. */
const PERMISSION_ERRORS = new Set(['AccessDenied', 'AllAccessDisabled', 'AccountProblem']);

/** Names that mean the bucket itself could not be found. */
const BUCKET_ERRORS = new Set([
  'NoSuchBucket',
  'PermanentRedirect',
  'AuthorizationQueryParameters',
]);

/**
 * The error names, and the HTTP status used when a response has no name we
 * know, that decide each kind. Exported because the "If it fails" section on
 * every /connect page lists them, and reading them from here is what keeps the
 * page and the classifier from drifting apart.
 */
export const CONNECTION_FAILURE_CODES = {
  credentials: { names: [...CREDENTIAL_ERRORS], status: 401 },
  bucket: { names: [...BUCKET_ERRORS], status: 404 },
  permissions: { names: [...PERMISSION_ERRORS], status: 403 },
} as const satisfies Partial<
  Record<ConnectionFailureKind, { names: readonly string[]; status: number }>
>;

interface SdkErrorShape {
  name?: unknown;
  message?: unknown;
  $metadata?: { httpStatusCode?: unknown };
}

function read(error: unknown): { name: string; message: string; status?: number } {
  const shape = (error ?? {}) as SdkErrorShape;
  const status = shape.$metadata?.httpStatusCode;

  return {
    name: typeof shape.name === 'string' ? shape.name : '',
    message: typeof shape.message === 'string' ? shape.message : '',
    status: typeof status === 'number' ? status : undefined,
  };
}

/**
 * A browser reports a blocked cross-origin request as an opaque network
 * failure: no status, no body, and a `TypeError` whose message differs per
 * engine. It is indistinguishable from being offline from here, which is why
 * the copy names both possibilities rather than asserting one.
 */
function isNetworkFailure(name: string, message: string, status?: number): boolean {
  if (status !== undefined) return false;

  if (name === 'TypeError' || name === 'NetworkError' || name === 'AbortError') return true;

  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

/** Reads an unknown throw from an S3 call as something a user can act on. */
export function classifyConnectionFailure(error: unknown): ConnectionFailure {
  const { name, message, status } = read(error);

  if (isNetworkFailure(name, message, status)) {
    return {
      kind: 'network',
      title: CONNECTION_FAILURE_TITLES.network,
      detail:
        'The request never completed. This is usually a missing CORS rule on the bucket, which the setup steps for your provider cover. It can also just be a dropped connection.',
      retryable: true,
      cause: error,
    };
  }

  if (CREDENTIAL_ERRORS.has(name) || status === CONNECTION_FAILURE_CODES.credentials.status) {
    return {
      kind: 'credentials',
      title: CONNECTION_FAILURE_TITLES.credentials,
      detail:
        'Your storage provider did not accept the access key or secret. Check both for a typo or a stray space, and that the key has not been revoked.',
      retryable: false,
      cause: error,
    };
  }

  if (BUCKET_ERRORS.has(name) || status === CONNECTION_FAILURE_CODES.bucket.status) {
    return {
      kind: 'bucket',
      title: CONNECTION_FAILURE_TITLES.bucket,
      detail:
        'The keys worked, but no bucket by that name exists in this region. Check the spelling and that the region matches where you created it.',
      retryable: false,
      cause: error,
    };
  }

  // Checked after the bucket case on purpose. A bucket in another account
  // answers with AccessDenied rather than NoSuchBucket, so a 403 here means
  // "not yours or not allowed", which is the same fix either way.
  if (PERMISSION_ERRORS.has(name) || status === CONNECTION_FAILURE_CODES.permissions.status) {
    return {
      kind: 'permissions',
      title: CONNECTION_FAILURE_TITLES.permissions,
      detail:
        'Your provider recognised the key but refused the request. The key needs list and read permission on this bucket - the setup steps for your provider list exactly which.',
      retryable: false,
      cause: error,
    };
  }

  return {
    kind: 'unknown',
    title: CONNECTION_FAILURE_TITLES.unknown,
    detail:
      'Your provider returned an error we do not recognise. Trying again is worth a go; if it keeps happening the browser console has the original message.',
    retryable: true,
    cause: error,
  };
}

/**
 * A classified failure, thrown.
 *
 * `createSession` used to throw `new Error('Login failed')`, which told the
 * form nothing it could pass on. Carrying the classification means the caller
 * can name the actual problem without re-deriving it from an error it has
 * already lost the type of.
 */
export class ConnectionFailureError extends Error {
  readonly failure: ConnectionFailure;

  constructor(failure: ConnectionFailure) {
    super(failure.title);
    this.name = 'ConnectionFailureError';
    this.failure = failure;
  }
}

/** Reads a failure back off a throw, classifying anything that is not one. */
export function failureFrom(error: unknown): ConnectionFailure {
  return error instanceof ConnectionFailureError ? error.failure : classifyConnectionFailure(error);
}
