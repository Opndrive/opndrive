import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTransientUploadError, waitBeforeRetry } from './retry.js';

const withStatus = (status: number, name = 'S3Error') =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

describe('isTransientUploadError', () => {
  it.each([500, 502, 503, 504, 429, 408])('retries a %i', (status) => {
    expect(isTransientUploadError(withStatus(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 409])(
    'does not retry a %i, which will only come back the same',
    (status) => {
      expect(isTransientUploadError(withStatus(status))).toBe(false);
    }
  );

  it('retries a request that never got an answer', () => {
    // How a browser reports a dropped connection, a blocked request, offline.
    expect(isTransientUploadError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientUploadError(Object.assign(new Error('x'), { name: 'NetworkError' }))).toBe(
      true
    );
    expect(
      isTransientUploadError(Object.assign(new Error('x'), { name: 'UploadStalledError' }))
    ).toBe(true);
  });

  it('retries the throttling names S3 uses, even without a status', () => {
    expect(isTransientUploadError(Object.assign(new Error('x'), { name: 'SlowDown' }))).toBe(true);
    expect(
      isTransientUploadError(Object.assign(new Error('x'), { name: 'ServiceUnavailable' }))
    ).toBe(true);
  });

  it('retries the passing errors S3 reports with a 400', () => {
    // S3 sends these with "400 Bad Request", and its error code is the more
    // specific of the two: "your connection went quiet", "slow down".
    expect(isTransientUploadError(withStatus(400, 'RequestTimeout'))).toBe(true);
    expect(isTransientUploadError(withStatus(400, 'Throttling'))).toBe(true);
    expect(isTransientUploadError(withStatus(400, 'RequestLimitExceeded'))).toBe(true);
  });

  it('reads a network failure from its message as a last resort', () => {
    expect(isTransientUploadError(new Error('socket hang up'))).toBe(true);
    expect(isTransientUploadError(new Error('Connection reset by peer'))).toBe(true);
  });

  it('trusts a status over a name or a message', () => {
    // A 403 that happens to mention the network is still a refusal.
    const refusal = Object.assign(new Error('network policy denies this'), {
      name: 'NetworkError',
      $metadata: { httpStatusCode: 403 },
    });
    expect(isTransientUploadError(refusal)).toBe(false);
  });

  it('does not retry anything it cannot read', () => {
    expect(isTransientUploadError(new Error('File is too large to upload'))).toBe(false);
    expect(isTransientUploadError(undefined)).toBe(false);
    expect(isTransientUploadError('boom')).toBe(false);
  });
});

describe('waitBeforeRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubBrowser(onLine: boolean) {
    const listeners: Record<string, (() => void)[]> = {};
    vi.stubGlobal('navigator', { onLine });
    vi.stubGlobal('window', {
      addEventListener: (event: string, listener: () => void) => {
        (listeners[event] ??= []).push(listener);
      },
    });
    return { goOnline: () => listeners.online?.forEach((listener) => listener()) };
  }

  it('waits the delay it is given', async () => {
    vi.useFakeTimers();
    let done = false;
    void waitBeforeRetry(2_000).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(1_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('then waits for the connection to come back, however long that takes', async () => {
    const browser = stubBrowser(false);
    let done = false;
    void waitBeforeRetry(0).then(() => (done = true));

    await new Promise((resolve) => setTimeout(resolve, 20));
    // Retrying now would only spend the retry.
    expect(done).toBe(false);

    browser.goOnline();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(true);
  });

  it('does not wait for a connection it already has', async () => {
    stubBrowser(true);

    await expect(waitBeforeRetry(0)).resolves.toBeUndefined();
  });
});
