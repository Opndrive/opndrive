/**
 * Deciding whether a failed upload is worth trying again, and waiting first.
 *
 * The S3 client already retries a single request a few times, a second or so
 * apart. That covers a throttled request or a 503. It does not cover the
 * ordinary things that go wrong in a browser: wifi dropping for half a minute,
 * a laptop lid closed and opened again, a train going into a tunnel. Every one
 * of those used to fail the upload for good. These are the second, slower
 * layer, around a whole upload attempt.
 */

/** How long to wait before each automatic retry. Its length is how many there are. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000, 30_000];

/** Error names that mean the request never got a real answer. */
const NO_ANSWER = new Set([
  'NetworkError',
  'TypeError',
  'AbortError',
  'TimeoutError',
  'UploadStalledError',
]);

/** Error names S3 uses for a problem on its side that clears by itself. */
const SERVER_HICCUPS = new Set([
  'SlowDown',
  'ServiceUnavailable',
  'InternalError',
  'RequestTimeout',
  'Throttling',
  'ThrottlingException',
  'RequestLimitExceeded',
]);

const NETWORK_MESSAGE =
  /network|failed to fetch|load failed|timed? ?out|connection|socket hang up|econnreset/i;

/**
 * Whether trying the same upload again could succeed without anyone changing
 * anything.
 *
 * S3's own error code comes first. It is the most specific thing in the
 * answer, and some codes that mean "not now" arrive as "400 Bad Request":
 * RequestTimeout (the connection went quiet mid-upload) and the throttling
 * codes. Read by status alone, those failed the upload for good.
 *
 * Otherwise a server that answered with a status said something definite.
 * 5xx, 429 and 408 mean "not now"; anything else - a 403 for a revoked key, a
 * 404 for a missing bucket - will say the same thing on every attempt, so it
 * is not retried. No status at all means the request never got an answer,
 * which in a browser is a dropped connection.
 *
 * Our own aborts never reach here: a paused or cancelled upload is caught
 * before it is treated as a failure.
 */
export function isTransientUploadError(error: unknown): boolean {
  const facts = readError(error);
  if (!facts) return false;

  if (typeof facts.name === 'string' && SERVER_HICCUPS.has(facts.name)) return true;

  if (typeof facts.status === 'number') {
    return facts.status >= 500 || facts.status === 429 || facts.status === 408;
  }

  return gotNoAnswer(facts);
}

/** The parts of an error the decisions here are made on, or null for a non-object. */
function readError(error: unknown) {
  if (!error || typeof error !== 'object') return null;

  const { name, message, $metadata } = error as {
    name?: unknown;
    message?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return { name, message, status: $metadata?.httpStatusCode };
}

/**
 * Whether a failure says its request got no answer at all: no HTTP status,
 * and a name or message that means a lost connection. Without the second
 * half, any error with no status would do, including the upload's own, such
 * as a file too large to send, which are thrown before anything goes out.
 */
function gotNoAnswer(facts: NonNullable<ReturnType<typeof readError>>): boolean {
  if (typeof facts.status === 'number') return false;
  if (typeof facts.name === 'string' && NO_ANSWER.has(facts.name)) return true;
  return typeof facts.message === 'string' && NETWORK_MESSAGE.test(facts.message);
}

/**
 * How long an upload waits for the browser's `online` event before trying
 * again anyway. Trying while really offline fails at once and costs nothing.
 */
export const OFFLINE_RECHECK_MS = 30_000;

/** Whether the browser says it has no network. Never true outside a browser. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Whether a failure is the network being gone: the browser says it is
 * offline, and the request got no answer at all.
 *
 * Both, because the browser can be wrong. A failure that came with an HTTP
 * status was answered by a server, which proves there is a network, so it
 * counts like any other failure. Otherwise a refusal while the browser
 * wrongly said "offline" would be tried again every so often for good.
 *
 * And "no answer" means one that looks like a lost connection, not merely
 * one without a status. A failure of the upload's own has no status either,
 * and was waited on and tried again every 30 seconds while offline, only to
 * fail the same way once the network came back.
 */
export function failedOffline(error: unknown): boolean {
  if (!isBrowserOffline()) return false;

  const facts = readError(error);
  return facts !== null && gotNoAnswer(facts);
}

export interface WaitBeforeRetryOptions {
  /** Ends the wait at once: the upload was paused, cancelled or torn down. */
  signal?: AbortSignal;
  /** See OFFLINE_RECHECK_MS. */
  offlineRecheckMs?: number;
}

/**
 * Waits `delayMs`, and then, while the browser says it is offline, for the
 * network to come back.
 *
 * Retrying while offline only spends the retry, and waiting for the `online`
 * event means an upload interrupted by a lost connection carries on when the
 * connection comes back. That wait is capped at `offlineRecheckMs`, after
 * which the caller tries again: a browser can be wrong about being offline,
 * and an `online` event that never comes left the upload "uploading" for
 * good. The caller decides what a try made while still offline costs; see
 * UploadManager.processQueue.
 *
 * `signal` ends the wait early, and lets go of the `online` listener, which
 * a paused or cancelled upload used to keep, with the upload it held, until
 * the browser came back online.
 *
 * Outside a browser there is no `navigator.onLine` to consult, and only the
 * delay applies.
 */
export async function waitBeforeRetry(
  delayMs: number,
  { signal, offlineRecheckMs = OFFLINE_RECHECK_MS }: WaitBeforeRetryOptions = {}
): Promise<void> {
  if (delayMs > 0) await wait(delayMs, signal);

  if (signal?.aborted || typeof window === 'undefined' || !isBrowserOffline()) return;

  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('online', done);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, offlineRecheckMs);
    window.addEventListener('online', done);
    signal?.addEventListener('abort', done);
  });
}

/** `ms`, or until `signal` fires, whichever is first. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();

    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}
