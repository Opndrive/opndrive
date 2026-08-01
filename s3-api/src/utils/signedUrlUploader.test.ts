/**
 * `SignedUrlUploader` PUTs a file straight at a presigned URL over
 * `XMLHttpRequest` - chosen over fetch because it is the only browser API that
 * reports upload progress. XHR does not exist in the node test environment, so
 * these suites install a fake that lets each lifecycle event be fired
 * deliberately.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignedUrlUploader } from './signedUrlUploader.js';
import type { BYOS3ApiProvider } from '../index.js';

type Listener = (event?: unknown) => void;

class FakeXhr {
  static instances: FakeXhr[] = [];

  status = 200;
  method?: string;
  url?: string;
  headers: Record<string, string> = {};
  body?: unknown;
  aborted = false;

  private listeners = new Map<string, Listener[]>();
  private uploadListeners = new Map<string, Listener[]>();

  upload = {
    addEventListener: (type: string, cb: Listener) => {
      this.uploadListeners.set(type, [...(this.uploadListeners.get(type) ?? []), cb]);
    },
  };

  constructor() {
    FakeXhr.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.fire('abort');
  }

  /** Drives a lifecycle event the way a real XHR would. */
  fire(type: string, event?: unknown) {
    (this.listeners.get(type) ?? []).forEach((cb) => cb(event));
  }

  fireProgress(event: { lengthComputable: boolean; loaded: number; total: number }) {
    (this.uploadListeners.get('progress') ?? []).forEach((cb) => cb(event));
  }
}

const uploadWithPreSignedUrl = vi.fn(async () => 'https://signed.example.com/put');

function makeUploader(overrides: { key?: string; expiresInSeconds?: number } = {}) {
  return new SignedUrlUploader({
    apiProvider: { uploadWithPreSignedUrl } as unknown as BYOS3ApiProvider,
    key: overrides.key ?? 'users/alice/a.txt',
    fileName: 'a.txt',
    expiresInSeconds: overrides.expiresInSeconds,
  });
}

/** Starts an upload and waits for the fake XHR to be created and sent. */
async function startUpload(uploader: SignedUrlUploader, file: File) {
  const promise = uploader.upload(file);
  await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
  return { promise, xhr: FakeXhr.instances[0]! };
}

beforeEach(() => {
  FakeXhr.instances = [];
  uploadWithPreSignedUrl.mockClear();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signing', () => {
  it('requests a presigned URL for the configured key', async () => {
    const { promise, xhr } = await startUpload(
      makeUploader({ key: 'k/a.txt' }),
      new File([''], 'a')
    );

    expect(uploadWithPreSignedUrl).toHaveBeenCalledWith({
      key: 'k/a.txt',
      expiresInSeconds: 3600,
    });
    xhr.fire('load');
    await promise;
  });

  it('defaults the URL lifetime to one hour', async () => {
    const { promise, xhr } = await startUpload(makeUploader(), new File([''], 'a'));

    expect(uploadWithPreSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInSeconds: 3600 })
    );
    xhr.fire('load');
    await promise;
  });

  it('honours a caller-supplied lifetime', async () => {
    const { promise, xhr } = await startUpload(
      makeUploader({ expiresInSeconds: 60 }),
      new File([''], 'a')
    );

    expect(uploadWithPreSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInSeconds: 60 })
    );
    xhr.fire('load');
    await promise;
  });

  it('propagates a signing failure without opening a request', async () => {
    uploadWithPreSignedUrl.mockRejectedValueOnce(new Error('signing refused'));

    await expect(makeUploader().upload(new File([''], 'a'))).rejects.toThrow('signing refused');
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('the request', () => {
  it('PUTs the file to the signed URL', async () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    const { promise, xhr } = await startUpload(makeUploader(), file);

    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://signed.example.com/put');
    expect(xhr.body).toBe(file);
    xhr.fire('load');
    await promise;
  });

  it("sends the file's own content type", async () => {
    const { promise, xhr } = await startUpload(
      makeUploader(),
      new File(['x'], 'a.pdf', { type: 'application/pdf' })
    );

    expect(xhr.headers['Content-Type']).toBe('application/pdf');
    xhr.fire('load');
    await promise;
  });

  it('falls back to a binary content type when the file has none', async () => {
    const { promise, xhr } = await startUpload(makeUploader(), new File(['x'], 'unknown'));

    // An empty Content-Type is signed into the request and S3 stores the object
    // with no usable type, which breaks previews later.
    expect(xhr.headers['Content-Type']).toBe('application/octet-stream');
    xhr.fire('load');
    await promise;
  });
});

describe('completion', () => {
  it.each([200, 201, 204, 299])('resolves on a %i response', async (status) => {
    const { promise, xhr } = await startUpload(makeUploader(), new File([''], 'a'));

    xhr.status = status;
    xhr.fire('load');

    await expect(promise).resolves.toBeUndefined();
  });

  it.each([199, 300, 403, 500])('rejects on a %i response', async (status) => {
    const { promise, xhr } = await startUpload(makeUploader(), new File([''], 'a'));

    xhr.status = status;
    xhr.fire('load');

    await expect(promise).rejects.toThrow(`Upload failed with status ${status}`);
  });

  it('rejects on a network error', async () => {
    const { promise, xhr } = await startUpload(makeUploader(), new File([''], 'a'));

    xhr.fire('error');

    await expect(promise).rejects.toThrow('Upload failed due to network error');
  });

  it('rejects when the request is aborted', async () => {
    const { promise, xhr } = await startUpload(makeUploader(), new File([''], 'a'));

    xhr.fire('abort');

    await expect(promise).rejects.toThrow('Upload cancelled');
  });
});

describe('progress', () => {
  it('reports rounded percentages', async () => {
    const progress: number[] = [];
    const uploader = makeUploader();
    const promise = uploader.upload(new File([''], 'a'), (p) => progress.push(p));
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    const xhr = FakeXhr.instances[0]!;

    xhr.fireProgress({ lengthComputable: true, loaded: 1, total: 3 });
    xhr.fireProgress({ lengthComputable: true, loaded: 3, total: 3 });

    expect(progress).toEqual([33, 100]);
    xhr.fire('load');
    await promise;
  });

  it('stays silent when the total size is unknown', async () => {
    const onProgress = vi.fn();
    const uploader = makeUploader();
    const promise = uploader.upload(new File([''], 'a'), onProgress);
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    const xhr = FakeXhr.instances[0]!;

    // A percentage against an unknown total would be meaningless.
    xhr.fireProgress({ lengthComputable: false, loaded: 1, total: 0 });

    expect(onProgress).not.toHaveBeenCalled();
    xhr.fire('load');
    await promise;
  });

  it('tolerates progress events with no callback registered', async () => {
    const { promise, xhr } = await startUpload(makeUploader(), new File([''], 'a'));

    expect(() => xhr.fireProgress({ lengthComputable: true, loaded: 1, total: 2 })).not.toThrow();
    xhr.fire('load');
    await promise;
  });
});

describe('cancel', () => {
  it('aborts the in-flight request and rejects the upload', async () => {
    const uploader = makeUploader();
    const { promise, xhr } = await startUpload(uploader, new File([''], 'a'));

    uploader.cancel();

    expect(xhr.aborted).toBe(true);
    await expect(promise).rejects.toThrow('Upload cancelled');
  });

  it('is a no-op before an upload has started', () => {
    expect(() => makeUploader().cancel()).not.toThrow();
  });

  it('is safe to call twice', async () => {
    const uploader = makeUploader();
    const { promise, xhr } = await startUpload(uploader, new File([''], 'a'));

    uploader.cancel();
    uploader.cancel();

    // The controller is nulled on the first call, so the second cannot abort a
    // subsequent upload that reused this uploader.
    expect(xhr.aborted).toBe(true);
    await expect(promise).rejects.toThrow();
  });
});

describe('pause compatibility shim', () => {
  it('starts unpaused', () => {
    expect(makeUploader().isPausedState()).toBe(false);
  });

  it('records the paused flag without stopping the request', async () => {
    const uploader = makeUploader();
    const { promise, xhr } = await startUpload(uploader, new File([''], 'a'));

    uploader.pause();

    // Signed-URL uploads genuinely cannot pause; the flag exists only so this
    // class matches MultipartUploader's shape. The request keeps running.
    expect(uploader.isPausedState()).toBe(true);
    expect(xhr.aborted).toBe(false);
    xhr.fire('load');
    await promise;
  });
});
