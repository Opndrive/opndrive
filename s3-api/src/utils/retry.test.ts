import { afterEach, describe, expect, it, vi } from 'vitest';
import { failedOffline, isTransientUploadError, uploadError, waitBeforeRetry } from './retry.js';

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

  it("does not take the upload's own error for a lost connection, whatever file it names", () => {
    // The message names the file, and a file called network-capture.pcap
    // read as "network" was retried, or waited on while offline, for a
    // refusal that comes back the same every time.
    vi.stubGlobal('navigator', { onLine: false });
    const own = uploadError('network-capture.pcap is too large to upload.');

    expect(isTransientUploadError(own)).toBe(false);
    expect(failedOffline(own)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('retries what each browser says when a fetch gets no answer', () => {
    for (const message of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'fetch failed',
    ]) {
      expect(isTransientUploadError(new TypeError(message))).toBe(true);
    }
  });

  it('does not retry a TypeError that is a bug in the code', () => {
    // A TypeError is also what reading a property of undefined throws, and
    // it fails the same way on every attempt.
    expect(
      isTransientUploadError(new TypeError("Cannot read properties of undefined (reading 'size')"))
    ).toBe(false);
    expect(
      isTransientUploadError(
        new TypeError("Cannot read properties of undefined (reading 'connection')")
      )
    ).toBe(false);
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

describe('failedOffline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a failure with no answer while the browser says it is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });

    expect(failedOffline(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('is not one the server answered, whatever the browser says', () => {
    vi.stubGlobal('navigator', { onLine: false });

    expect(failedOffline(withStatus(403, 'AccessDenied'))).toBe(false);
  });

  it('is not anything while the browser says it is online', () => {
    vi.stubGlobal('navigator', { onLine: true });

    expect(failedOffline(new TypeError('Failed to fetch'))).toBe(false);
  });

  it("is not a failure of the upload's own, which has no status either", () => {
    // Thrown before anything is sent. Read as the network's, it was tried
    // again every 30 seconds for as long as the browser said offline.
    vi.stubGlobal('navigator', { onLine: false });

    expect(
      failedOffline(new Error('big.bin is too large to upload. A multipart upload can have…'))
    ).toBe(false);
    expect(failedOffline(new Error('No uploadId found. Start a new upload.'))).toBe(false);
  });

  it('is every kind of no answer the uploaders report', () => {
    vi.stubGlobal('navigator', { onLine: false });

    for (const name of ['NetworkError', 'TimeoutError', 'UploadStalledError']) {
      expect(failedOffline(Object.assign(new Error('x'), { name }))).toBe(true);
    }
    expect(failedOffline(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
  });

  it('is not anything it cannot read', () => {
    vi.stubGlobal('navigator', { onLine: false });

    expect(failedOffline('Failed')).toBe(false);
    expect(failedOffline(null)).toBe(false);
    expect(failedOffline({})).toBe(false);
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
      removeEventListener: (event: string, listener: () => void) => {
        listeners[event] = (listeners[event] ?? []).filter((other) => other !== listener);
      },
    });
    return {
      goOnline: () => [...(listeners.online ?? [])].forEach((listener) => listener()),
      onlineListeners: () => (listeners.online ?? []).length,
    };
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

  /**
   * Told to stop: the upload was paused, cancelled or torn down. The wait
   * used to run on regardless, and one for the network kept its listener,
   * and the upload it was holding, until the browser came back online.
   */
  describe('when told to stop', () => {
    it('stops during the delay', async () => {
      vi.useFakeTimers();
      const stop = new AbortController();
      let done = false;
      void waitBeforeRetry(30_000, { signal: stop.signal }).then(() => (done = true));

      stop.abort();
      await vi.advanceTimersByTimeAsync(0);

      expect(done).toBe(true);
    });

    it('stops waiting for the network, and lets go of its listener', async () => {
      const browser = stubBrowser(false);
      const stop = new AbortController();
      let done = false;
      void waitBeforeRetry(0, { signal: stop.signal }).then(() => (done = true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(browser.onlineListeners()).toBe(1);

      stop.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(done).toBe(true);
      expect(browser.onlineListeners()).toBe(0);
    });

    it('does not wait at all once already told', async () => {
      stubBrowser(false);
      const stop = new AbortController();
      stop.abort();

      await expect(waitBeforeRetry(30_000, { signal: stop.signal })).resolves.toBeUndefined();
    });
  });

  it('tries again after a while even if the browser still says it is offline', async () => {
    // A browser can be wrong about it, behind some VPNs for one. Waiting for
    // an 'online' event that never comes left the upload "uploading" for good.
    vi.useFakeTimers();
    const browser = stubBrowser(false);
    let done = false;
    void waitBeforeRetry(0, { offlineRecheckMs: 30_000 }).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(done).toBe(true);
    expect(browser.onlineListeners()).toBe(0);
  });
});
