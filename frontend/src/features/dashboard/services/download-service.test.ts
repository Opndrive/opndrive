import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { createDownloadService, type DownloadProgress } from './download-service';
import type { FileItem } from '../types/file';

const SIGNED_URL = 'https://test-bucket.s3.amazonaws.com/folder/abc123hash?X-Amz-Signature=sig';

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 'file-1',
    name: 'quarterly report.pdf',
    Key: 'folder/abc123hash',
    Size: 12,
    extension: 'pdf',
    size: { value: 12, unit: 'B' },
    ...overrides,
  } as FileItem;
}

function makeApi(getSignedUrl = vi.fn().mockResolvedValue(SIGNED_URL)) {
  return { getSignedUrl } as unknown as BYOS3ApiProvider;
}

/**
 * Minimal Response stand-in. The service only reads ok/status/headers/body/blob,
 * and hand-rolling it keeps the chunk boundaries exact so progress values are
 * predictable.
 */
function streamingResponse(chunks: Uint8Array[], opts: { contentLength?: number } = {}) {
  const total = opts.contentLength ?? chunks.reduce((n, c) => n + c.byteLength, 0);
  const headers = new Headers();
  if (opts.contentLength !== 0) headers.set('Content-Length', String(total));

  return {
    ok: true,
    status: 200,
    headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
    blob: async () => new Blob(chunks as BlobPart[]),
  } as unknown as Response;
}

/** A stream that yields one chunk then stalls until the signal aborts it. */
function stallingResponse(signal: AbortSignal, first: Uint8Array) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Length': '1000' }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
        signal.addEventListener('abort', () =>
          controller.error(new DOMException('Aborted', 'AbortError'))
        );
      },
    }),
  } as unknown as Response;
}

let clicks: { href: string; download: string }[];
let revoked: string[];

beforeEach(() => {
  clicks = [];
  revoked = [];

  // jsdom implements neither of these.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock/object-url');
  globalThis.URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadFile progress', () => {
  it('reports real byte progress instead of synthetic values', async () => {
    // Four 3-byte chunks of a 12-byte file => exact quarters.
    const chunks = [1, 2, 3, 4].map(() => new Uint8Array([1, 2, 3]));
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse(chunks));
    vi.stubGlobal('fetch', fetchMock);

    const updates: DownloadProgress[] = [];
    await createDownloadService(makeApi()).downloadFile(makeFile(), {
      onProgress: (p) => updates.push(p),
    });

    const streaming = updates.filter((u) => u.status === 'downloading' && u.loadedBytes);
    expect(streaming.map((u) => u.loadedBytes)).toEqual([3, 6, 9, 12]);
    expect(streaming.map((u) => Math.round(u.progress))).toEqual([25, 50, 75, 99]);

    // The old implementation ended on a fixed timer regardless of bytes; this
    // one only completes after the body is fully drained.
    const last = updates[updates.length - 1];
    expect(last.status).toBe('completed');
    expect(last.progress).toBe(100);
    expect(last.loadedBytes).toBe(12);
  });

  it('never reports 100% while bytes are still arriving', async () => {
    const chunks = Array.from({ length: 5 }, () => new Uint8Array([9, 9]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse(chunks)));

    const updates: DownloadProgress[] = [];
    await createDownloadService(makeApi()).downloadFile(makeFile({ Size: 10 }), {
      onProgress: (p) => updates.push(p),
    });

    const midFlight = updates.filter((u) => u.status === 'downloading');
    expect(midFlight.every((u) => u.progress < 100)).toBe(true);
  });

  it('holds at zero when the server sends no Content-Length', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamingResponse(chunks, { contentLength: 0 }))
    );

    const updates: DownloadProgress[] = [];
    await createDownloadService(makeApi()).downloadFile(makeFile(), {
      onProgress: (p) => updates.push(p),
    });

    // No honest percentage is available, but byte counts still advance.
    const streaming = updates.filter((u) => u.status === 'downloading' && u.loadedBytes);
    expect(streaming.map((u) => u.progress)).toEqual([0, 0]);
    expect(streaming.map((u) => u.loadedBytes)).toEqual([2, 4]);
    expect(updates[updates.length - 1].status).toBe('completed');
  });
});

describe('downloadFile cancellation', () => {
  it('passes the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])]));
    vi.stubGlobal('fetch', fetchMock);

    await createDownloadService(makeApi()).downloadFile(makeFile());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the live request and reports cancelled, not error', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve(stallingResponse(init.signal as AbortSignal, new Uint8Array([1, 2, 3])))
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = createDownloadService(makeApi());
    const updates: DownloadProgress[] = [];
    const onError = vi.fn();

    const file = makeFile();
    const pending = service.downloadFile(file, { onProgress: (p) => updates.push(p), onError });

    // Let the first chunk land so the read loop is genuinely in flight.
    await vi.waitFor(() => expect(updates.some((u) => u.loadedBytes === 3)).toBe(true));
    service.cancelDownload(file.id);
    await pending;

    expect(updates[updates.length - 1].status).toBe('cancelled');
    // A user-initiated cancel is not a failure.
    expect(onError).not.toHaveBeenCalled();
    expect(clicks).toHaveLength(0);
  });

  it('does not save a file when cancelled after the last chunk', async () => {
    const service = createDownloadService(makeApi());
    const file = makeFile();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        // Abort in the window between the body completing and the save.
        queueMicrotask(() => service.cancelDownload(file.id));
        return streamingResponse([new Uint8Array([1, 2, 3])]);
      })
    );

    const updates: DownloadProgress[] = [];
    await service.downloadFile(file, { onProgress: (p) => updates.push(p) });

    expect(updates[updates.length - 1].status).toBe('cancelled');
    expect(clicks).toHaveLength(0);
  });
});

describe('downloadFile progress volume', () => {
  it('coalesces thousands of chunks into at most one update per percent', async () => {
    // 1000 single-byte chunks: forwarding each one would re-render every
    // progress subscriber a thousand times for one download.
    const chunks = Array.from({ length: 1000 }, () => new Uint8Array([7]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse(chunks)));

    const updates: DownloadProgress[] = [];
    await createDownloadService(makeApi()).downloadFile(makeFile({ Size: 1000 }), {
      onProgress: (p) => updates.push(p),
    });

    const streaming = updates.filter((u) => u.status === 'downloading' && u.loadedBytes);
    // ~1 per percent, versus 1000 without coalescing.
    expect(streaming.length).toBeLessThanOrEqual(101);
    // Still fine-grained enough to animate smoothly.
    expect(streaming.length).toBeGreaterThan(50);
    // Coalescing must not lose the final byte count.
    expect(streaming[streaming.length - 1].loadedBytes).toBe(1000);
    expect(streaming.every((u) => u.progress < 100)).toBe(true);
  });
});

describe('downloadFile abort hygiene', () => {
  it('produces no unhandled promise rejection when aborted mid-stream', async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) =>
          Promise.resolve(stallingResponse(init.signal as AbortSignal, new Uint8Array([1, 2, 3])))
        )
      );

      const service = createDownloadService(makeApi());
      const file = makeFile();
      const updates: DownloadProgress[] = [];
      const pending = service.downloadFile(file, { onProgress: (p) => updates.push(p) });

      await vi.waitFor(() => expect(updates.some((u) => u.loadedBytes === 3)).toBe(true));
      service.cancelDownload(file.id);
      await pending;

      // Give any stray rejection a turn of the loop to surface.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(seen).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('does not hand a large file to the browser when cancelled while signing', async () => {
    let releaseUrl: (url: string) => void = () => {};
    const getSignedUrl = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseUrl = resolve;
        })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = createDownloadService(makeApi(getSignedUrl));
    const file = makeFile({ Size: 3 * 1024 * 1024 * 1024 });
    const updates: DownloadProgress[] = [];

    const pending = service.downloadFile(file, { onProgress: (p) => updates.push(p) });
    await vi.waitFor(() => expect(getSignedUrl).toHaveBeenCalled());

    // Signing is not abortable, so the cancel lands while it is still pending.
    service.cancelDownload(file.id);
    releaseUrl(SIGNED_URL);
    await pending;

    // The browser hand-off is irreversible, so it must not happen at all.
    expect(clicks).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates[updates.length - 1].status).toBe('cancelled');
  });
});

describe('downloadFile filename handling', () => {
  it('requests an attachment filename on the presigned URL', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(SIGNED_URL);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])])));

    await createDownloadService(makeApi(getSignedUrl)).downloadFile(makeFile());

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'folder/abc123hash',
        isPreview: false,
        downloadFilename: 'quarterly report.pdf',
      })
    );
  });

  it('saves via a same-origin blob URL so the download attribute is honoured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])])));

    await createDownloadService(makeApi()).downloadFile(makeFile());

    expect(clicks).toHaveLength(1);
    // The old code pointed the anchor at the cross-origin S3 URL, where the
    // browser ignores `download` and names the file after the key.
    expect(clicks[0].href).toContain('blob:');
    expect(clicks[0].href).not.toContain('s3.amazonaws.com');
    expect(clicks[0].download).toBe('quarterly report.pdf');
  });

  it('releases the object URL after handing the blob to the browser', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])])));

    await createDownloadService(makeApi()).downloadFile(makeFile());

    expect(revoked).toHaveLength(0); // not revoked synchronously - that can kill the download
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revoked).toEqual(['blob:mock/object-url']);
  });
});

describe('downloadFile large files', () => {
  it('hands files above the streaming cap to the browser instead of buffering', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const updates: DownloadProgress[] = [];
    const huge = makeFile({ Size: 3 * 1024 * 1024 * 1024 });
    await createDownloadService(makeApi()).downloadFile(huge, {
      onProgress: (p) => updates.push(p),
    });

    // Buffering 3 GB into a Blob would risk killing the tab.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clicks).toHaveLength(1);
    // Navigates to the presigned URL; Content-Disposition supplies the name.
    expect(clicks[0].href).toContain('s3.amazonaws.com');
    expect(clicks[0].download).toBe('');
    expect(updates[updates.length - 1].status).toBe('completed');
  });
});

describe('downloadFile failures', () => {
  it('surfaces a failed response as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, headers: new Headers() } as Response)
    );

    const updates: DownloadProgress[] = [];
    const onError = vi.fn();
    await createDownloadService(makeApi()).downloadFile(makeFile(), {
      onProgress: (p) => updates.push(p),
      onError,
    });

    expect(updates[updates.length - 1].status).toBe('error');
    expect(onError).toHaveBeenCalledWith('file-1', expect.stringContaining('403'));
    expect(clicks).toHaveLength(0);
  });

  it('reports an error when no signed URL comes back', async () => {
    const onError = vi.fn();
    await createDownloadService(makeApi(vi.fn().mockResolvedValue(''))).downloadFile(makeFile(), {
      onError,
    });

    expect(onError).toHaveBeenCalledWith('file-1', 'Failed to get download URL');
  });
});

describe('active download tracking', () => {
  it('clears the download from the active set once finished', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])])));

    const service = createDownloadService(makeApi());
    await service.downloadFile(makeFile());

    expect(service.isDownloadActive('file-1')).toBe(false);
    expect(service.getActiveDownloads()).toEqual([]);
  });
});
