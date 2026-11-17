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
  if (!error || typeof error !== 'object') return false;

  const { name, message, $metadata } = error as {
    name?: unknown;
    message?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const status = $metadata?.httpStatusCode;

  if (typeof name === 'string' && SERVER_HICCUPS.has(name)) return true;

  if (typeof status === 'number') {
    return status >= 500 || status === 429 || status === 408;
  }

  if (typeof name === 'string' && NO_ANSWER.has(name)) return true;

  return typeof message === 'string' && NETWORK_MESSAGE.test(message);
}

/**
 * Waits `delayMs`, and then for as long as the browser says it is offline.
 *
 * Retrying while offline only spends the retry. Waiting for the `online` event
 * instead means an upload interrupted by a lost connection carries on when the
 * connection comes back, however long that takes.
 *
 * Outside a browser there is no `navigator.onLine` to consult, and only the
 * delay applies.
 */
export async function waitBeforeRetry(delayMs: number): Promise<void> {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (navigator.onLine !== false) return;

  await new Promise<void>((resolve) => {
    window.addEventListener('online', () => resolve(), { once: true });
  });
}
