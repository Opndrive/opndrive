export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `fn` with exponential backoff and jitter. Only errors accepted by
 * `isRetryable` are retried; everything else - and exhausting maxAttempts -
 * rejects with the original error untouched.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.5;
      await sleep(backoff + jitter);
    }
  }

  // Unreachable - the loop above always either returns or throws - but keeps
  // the compiler happy without a non-null assertion on lastError.
  throw lastError;
}
