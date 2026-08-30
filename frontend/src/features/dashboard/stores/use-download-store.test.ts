/**
 * Download store: the shared map of in-flight downloads.
 *
 * The download *service* is mocked at the module boundary. It already has its
 * own suite covering streaming, progress and cancellation; what matters here is
 * that the store wires callbacks to state correctly, reuses one service per
 * provider, and clears finished rows on the right schedule.
 *
 * Store state is reset between tests by `__mocks__/zustand.ts` - see
 * src/tests/setup.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { useDownloadStore } from './use-download-store';
import { createDownloadService, type DownloadProgress } from '../services/download-service';
import type { FileItem } from '../types/file';

vi.mock('../services/download-service', () => ({
  createDownloadService: vi.fn(),
}));

const createDownloadServiceMock = vi.mocked(createDownloadService);

/** The callback bag the store hands to the service. */
interface DownloadHandlers {
  onProgress: (progress: DownloadProgress) => void;
  onComplete: (fileId: string) => void;
  onError?: (fileId: string, error: string) => void;
}

/**
 * A stand-in service whose callbacks the test drives by hand. Typed with the
 * real signature so mockImplementation stays type-checked rather than needing
 * casts at every call site.
 */
function fakeService() {
  return {
    downloadFile: vi.fn(async (_file: FileItem, _handlers: DownloadHandlers) => {}),
    cancelDownload: vi.fn((_fileId: string) => {}),
  };
}

/** Two distinct provider identities; the store keys its service cache on these. */
const apiA = { id: 'a' } as unknown as BYOS3ApiProvider;
const apiB = { id: 'b' } as unknown as BYOS3ApiProvider;

const file = { id: 'file-1', name: 'report.pdf' } as FileItem;

function progress(overrides: Partial<DownloadProgress> = {}): DownloadProgress {
  return {
    fileId: 'file-1',
    fileName: 'report.pdf',
    progress: 0,
    status: 'downloading',
    ...overrides,
  };
}

const store = () => useDownloadStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  createDownloadServiceMock.mockImplementation(() => fakeService() as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getService', () => {
  it('builds a service on first use', () => {
    const service = store().getService(apiA);

    expect(createDownloadServiceMock).toHaveBeenCalledExactlyOnceWith(apiA);
    expect(store().service).toBe(service);
    expect(store().serviceApi).toBe(apiA);
  });

  it('reuses the same service for the same provider', () => {
    const first = store().getService(apiA);
    const second = store().getService(apiA);

    // Downloads keep their AbortControllers inside the service, so rebuilding
    // it would leave cancel() addressing an instance that owns nothing.
    expect(second).toBe(first);
    expect(createDownloadServiceMock).toHaveBeenCalledOnce();
  });

  it('rebuilds when the provider changes', () => {
    const first = store().getService(apiA);
    const second = store().getService(apiB);

    // A new provider means new credentials (login/logout, bucket switch).
    expect(second).not.toBe(first);
    expect(createDownloadServiceMock).toHaveBeenCalledTimes(2);
    expect(store().serviceApi).toBe(apiB);
  });
});

describe('setProgress', () => {
  it('records a download by its file id', () => {
    store().setProgress(progress({ progress: 42 }));

    expect(store().downloads.get('file-1')).toEqual(progress({ progress: 42 }));
  });

  it('overwrites the previous entry for the same file', () => {
    store().setProgress(progress({ progress: 10 }));
    store().setProgress(progress({ progress: 90 }));

    expect(store().downloads.size).toBe(1);
    expect(store().downloads.get('file-1')!.progress).toBe(90);
  });

  it('replaces the map rather than mutating it', () => {
    const before = store().downloads;
    store().setProgress(progress());

    // Mutating in place would leave subscribed components rendering stale rows,
    // because the reference they compare against never changes.
    expect(store().downloads).not.toBe(before);
  });

  it('keeps unrelated downloads', () => {
    store().setProgress(progress({ fileId: 'a' }));
    store().setProgress(progress({ fileId: 'b' }));

    expect([...store().downloads.keys()]).toEqual(['a', 'b']);
  });
});

describe('removeDownload', () => {
  it('drops the download', () => {
    store().setProgress(progress());
    store().removeDownload('file-1');

    expect(store().downloads.has('file-1')).toBe(false);
  });

  it('leaves the state object untouched for an unknown id', () => {
    store().setProgress(progress());
    const before = store().downloads;

    store().removeDownload('never-existed');

    // Returning a fresh map here would re-render every subscriber for nothing.
    expect(store().downloads).toBe(before);
  });
});

describe('startDownload', () => {
  it('hands the file to the service', async () => {
    const service = fakeService();
    createDownloadServiceMock.mockReturnValue(service as never);

    await store().startDownload(apiA, file);

    expect(service.downloadFile).toHaveBeenCalledOnce();
    expect(service.downloadFile.mock.calls[0]![0]).toBe(file);
  });

  it('writes service progress into the store', async () => {
    const service = fakeService();
    service.downloadFile.mockImplementation(async (_f, opts) => {
      opts.onProgress(progress({ progress: 25 }));
    });
    createDownloadServiceMock.mockReturnValue(service as never);

    await store().startDownload(apiA, file);

    expect(store().downloads.get('file-1')!.progress).toBe(25);
  });

  it.each(['completed', 'cancelled', 'error'] as const)(
    'keeps a %s download on the list until it is removed',
    async (status) => {
      vi.useFakeTimers();
      const service = fakeService();
      service.downloadFile.mockImplementation(async (_f, opts) => {
        opts.onProgress(
          progress({ status, error: status === 'error' ? 'Network error' : undefined })
        );
      });
      createDownloadServiceMock.mockReturnValue(service as never);

      await store().startDownload(apiA, file);

      // Nothing takes it away on a timer. A row that removes itself is a
      // reason for a failure that disappears before anyone reads it, and the
      // panel it sits on can be collapsed at the time. Uploads and deletes
      // have always waited to be dismissed.
      vi.advanceTimersByTime(60_000);
      expect(store().downloads.has('file-1')).toBe(true);

      store().removeDownload('file-1');
      expect(store().downloads.has('file-1')).toBe(false);
    }
  );

  it('leaves an in-flight download on the list', async () => {
    vi.useFakeTimers();
    const service = fakeService();
    service.downloadFile.mockImplementation(async (_f, opts) => {
      opts.onProgress(progress({ status: 'downloading', progress: 50 }));
    });
    createDownloadServiceMock.mockReturnValue(service as never);

    await store().startDownload(apiA, file);
    vi.advanceTimersByTime(60_000);

    expect(store().downloads.has('file-1')).toBe(true);
  });

  it('forwards the caller error handler to the service', async () => {
    const onError = vi.fn();
    const service = fakeService();
    service.downloadFile.mockImplementation(async (_f, opts) => {
      opts.onError?.('file-1', 'boom');
    });
    createDownloadServiceMock.mockReturnValue(service as never);

    await store().startDownload(apiA, file, { onError });

    expect(onError).toHaveBeenCalledExactlyOnceWith('file-1', 'boom');
  });

  it('works without any handlers', async () => {
    const service = fakeService();
    service.downloadFile.mockImplementation(async (_f, opts) => {
      opts.onError?.('file-1', 'boom');
    });
    createDownloadServiceMock.mockReturnValue(service as never);

    await expect(store().startDownload(apiA, file)).resolves.toBeUndefined();
  });

  it('propagates a failure from the service', async () => {
    const service = fakeService();
    service.downloadFile.mockRejectedValue(new Error('signing failed'));
    createDownloadServiceMock.mockReturnValue(service as never);

    await expect(store().startDownload(apiA, file)).rejects.toThrow('signing failed');
  });
});

describe('cancelDownload', () => {
  it('asks the service to cancel', async () => {
    const service = fakeService();
    createDownloadServiceMock.mockReturnValue(service as never);
    await store().startDownload(apiA, file);

    store().cancelDownload('file-1');

    expect(service.cancelDownload).toHaveBeenCalledExactlyOnceWith('file-1');
  });

  it('is a no-op before any download has started', () => {
    // No service exists yet, so this must not throw on a stray cancel click.
    expect(() => store().cancelDownload('file-1')).not.toThrow();
  });

  it('does not remove the row itself', async () => {
    const service = fakeService();
    createDownloadServiceMock.mockReturnValue(service as never);
    await store().startDownload(apiA, file);
    store().setProgress(progress());

    store().cancelDownload('file-1');

    // The service emits the 'cancelled' update, which is what schedules removal.
    // Removing here too would drop the row before the user sees it was cancelled.
    expect(store().downloads.has('file-1')).toBe(true);
  });
});

describe('derived state', () => {
  it('lists every download', () => {
    store().setProgress(progress({ fileId: 'a' }));
    store().setProgress(progress({ fileId: 'b' }));

    expect(
      store()
        .getAllDownloads()
        .map((d) => d.fileId)
    ).toEqual(['a', 'b']);
  });

  it('lists nothing when idle', () => {
    expect(store().getAllDownloads()).toEqual([]);
  });

  it.each(['downloading', 'pending', 'queued'] as const)('reports %s as in progress', (status) => {
    store().setProgress(progress({ status }));

    expect(store().isDownloading('file-1')).toBe(true);
  });

  it.each(['completed', 'error', 'cancelled'] as const)('reports %s as finished', (status) => {
    store().setProgress(progress({ status }));

    expect(store().isDownloading('file-1')).toBe(false);
  });

  it('reports an unknown file as not downloading', () => {
    expect(store().isDownloading('never-seen')).toBe(false);
  });
});
